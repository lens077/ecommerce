// Command regionseed 把行政区划数据集(regions.tsv)转成灌库用的 seed_regions.sql。
//
// 仓库没有 migration 工具,schema.sql 一直是手工 psql 执行的,行政区划数据也照这个来:
// 产物 SQL 一起提交,部署时 psql -f 一次即可。这个程序只在数据集更新时才需要重跑。
//
//	go run ./cmd/regionseed
//
// 数据源: https://github.com/eduosi/district (Apache-2.0)
// 快照: commit 5202a44613461c6e556fba50f4764ce6b1fdaef7 (2026-01-22)
//
// 转换过程中要处理数据集的三个坑:
//
//  1. name 不含后缀 —— "北京" + "市" 才是完整名,拼起来存。
//  2. 层级不齐 —— 北京/天津/上海/重庆/香港/澳门 只有两级,省下面直接就是区,
//     没有「市辖区」这个中间节点。给这 6 个补一个合成的市级节点,
//     code 用国标的市辖区码(省码前两位 + "0100"),这样前端三级级联不用特判。
//     注意「省直辖县级行政区」(海南的琼海市、湖北的仙桃市等 49 个)是另一回事:
//     它们确实只到市级,不补节点,前端遇到空的区县列表按可选处理。
//  3. 28 行 code 为空(海外、台湾的连江/金门、香港 18 区、澳门 7 堂区),
//     不编造编号,code 留空,主键用数据集的 id。
package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	// 放在 seed 而不是 schema 目录：sqlc 会把 schema 目录下的每个 .sql
	// 都当建表语句解析，seed 文件混进去会直接报错。
	srcRel = "internal/data/seed/regions.tsv"
	dstRel = "internal/data/seed/seed_regions.sql"

	// 合成市级节点的 id 从这里往上排,避开数据集自己的 id(最大 3400 出头)。
	syntheticIDBase = 900000
)

// record 是数据集的一行,加上我们算出来的层级。
type record struct {
	ID        int
	ParentID  int
	Level     int
	Code      string
	Name      string // 已拼上后缀
	NameEN    string
	Pinyin    string
	SortOrder int
}

// municipalities 是需要补合成市级节点的 6 个省级单位,key 是省级 code。
// 值是合成节点的 code —— 就是国标里那个数据集没收录的市辖区码。
var municipalities = map[string]string{
	"110000": "110100", // 北京市
	"120000": "120100", // 天津市
	"310000": "310100", // 上海市
	"500000": "500100", // 重庆市
	"810000": "810100", // 香港特别行政区
	"820000": "820100", // 澳门特别行政区
}

// nameOverrides 修正数据集里的简称。只动省级 —— 省级名字每张表单都要展示,
// 而且「广西自治区」这种写法在快递面单上是不规范的。
// 市级以下(白沙自治县 vs 白沙黎族自治县)保持数据集原样,不去维护一张几百行的表。
var nameOverrides = map[string]string{
	"450000": "广西壮族自治区",
	"640000": "宁夏回族自治区",
	"650000": "新疆维吾尔自治区",
}

// suffixEN 把中文后缀翻成英文。数据集里出现过的后缀这里都要覆盖到,
// 漏了会在生成时报错而不是静默产出半截英文名。
var suffixEN = map[string]string{
	"":      "",
	"省":     "Province",
	"市":     "City",
	"区":     "District",
	"县":     "County",
	"自治区":   "Autonomous Region",
	"自治州":   "Autonomous Prefecture",
	"自治县":   "Autonomous County",
	"自治旗":   "Autonomous Banner",
	"地区":    "Prefecture",
	"堂区":    "Parish",
	"盟":     "League",
	"旗":     "Banner",
	"特区":    "Special District",
	"特别行政区": "SAR",
}

// enByCode 是英文惯用名覆盖表,key 是 6 位区划码。
// 数据集给的是汉语拼音(ISO 罗马化),不是英语里实际在用的名字:
// Neimenggu / Xizang 没人这么写,而 山西 和 陕西 的拼音撞在一起都是 shanxi,
// 不区分的话英文界面会出现两个同名省份。
var enByCode = map[string]string{
	"150000": "Inner Mongolia Autonomous Region",
	"540000": "Tibet Autonomous Region",
	"610000": "Shaanxi Province", // 与 山西 Shanxi 区分,这是通行的国家标准写法
	"810000": "Hong Kong SAR",
	"820000": "Macau SAR",
	"150100": "Hohhot City",
	"230100": "Harbin City",
	"540100": "Lhasa City",
	"650100": "Urumqi City",
}

// enByID 覆盖没有区划码的行,只能按数据集 id 认。
// 港澳的下级用的是粤语/葡语的官方英文名,套拼音会得到 "Kuiqing District"
// 这种香港人自己都认不出来的东西。
var enByID = map[int]string{
	35: "Overseas", // 海外
	// 香港 18 区
	507: "Central and Western District",
	508: "Kwai Tsing District",
	509: "Yuen Long District",
	510: "Tuen Mun District",
	511: "Tsuen Wan District",
	512: "Sai Kung District",
	513: "Sha Tin District",
	514: "Tai Po District",
	515: "North District",
	516: "Kwun Tong District",
	517: "Wong Tai Sin District",
	518: "Sham Shui Po District",
	519: "Yau Tsim Mong District",
	520: "Kowloon City District",
	521: "Southern District",
	522: "Eastern District",
	523: "Wan Chai District",
	524: "Islands District",
	// 澳门 7 个堂区
	525: "Nossa Senhora de Fatima Parish",
	526: "Santo Antonio Parish",
	527: "Se Parish",
	528: "Sao Lazaro Parish",
	529: "Sao Lourenco Parish",
	530: "Nossa Senhora do Carmo Parish",
	531: "Sao Francisco Xavier Parish",
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "regionseed:", err)
		os.Exit(1)
	}
}

func run() error {
	root, err := serviceRoot()
	if err != nil {
		return err
	}

	raw, err := readTSV(filepath.Join(root, srcRel))
	if err != nil {
		return err
	}

	records, err := build(raw)
	if err != nil {
		return err
	}

	dst := filepath.Join(root, dstRel)
	if err := writeSQL(dst, records); err != nil {
		return err
	}

	var byLevel [4]int
	for _, r := range records {
		byLevel[r.Level]++
	}
	fmt.Printf("已写入 %s\n共 %d 行(省 %d / 市 %d / 区县 %d)\n",
		dst, len(records), byLevel[1], byLevel[2], byLevel[3])
	return nil
}

// serviceRoot 找到 services/address 目录,允许从服务根目录或 cmd/regionseed 里跑。
func serviceRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for dir := wd; ; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, srcRel)); err == nil {
			return dir, nil
		}
		if dir == filepath.Dir(dir) {
			return "", fmt.Errorf("从 %s 往上找不到 %s", wd, srcRel)
		}
	}
}

// readTSV 读数据集。字段: id name parent_id initial initials pinyin extra suffix code area_code order
func readTSV(path string) ([]map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.Comma = '\t'
	// 数据集里有裸引号(比如地名带 " 的极少数行),关掉引号解析按纯文本切
	r.LazyQuotes = true
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("解析 %s: %w", path, err)
	}
	if len(rows) < 2 {
		return nil, fmt.Errorf("%s 里没有数据", path)
	}

	header := rows[0]
	out := make([]map[string]string, 0, len(rows)-1)
	for _, row := range rows[1:] {
		m := make(map[string]string, len(header))
		for i, h := range header {
			if i < len(row) {
				m[h] = row[i]
			}
		}
		out = append(out, m)
	}
	return out, nil
}

func build(raw []map[string]string) ([]record, error) {
	parentOf := make(map[int]int, len(raw))
	codeOf := make(map[int]string, len(raw))
	for _, m := range raw {
		id, err := strconv.Atoi(m["id"])
		if err != nil {
			return nil, fmt.Errorf("id %q 不是数字: %w", m["id"], err)
		}
		pid, err := strconv.Atoi(m["parent_id"])
		if err != nil {
			return nil, fmt.Errorf("id=%d 的 parent_id %q 不是数字: %w", id, m["parent_id"], err)
		}
		parentOf[id] = pid
		codeOf[id] = m["code"]
	}

	// 先给 6 个直辖市/特区各造一个市级节点,记下 省id -> 合成市id
	syntheticCity := make(map[int]int, len(municipalities))
	records := make([]record, 0, len(raw)+len(municipalities))

	next := syntheticIDBase
	provinceOrder := make([]int, 0, len(municipalities))
	for _, m := range raw {
		if parentOf[toInt(m["id"])] != 0 {
			continue
		}
		if _, ok := municipalities[m["code"]]; ok {
			provinceOrder = append(provinceOrder, toInt(m["id"]))
		}
	}
	sort.Ints(provinceOrder)
	for _, provID := range provinceOrder {
		syntheticCity[provID] = next
		next++
	}

	for _, m := range raw {
		id := toInt(m["id"])
		pid := parentOf[id]

		level, err := depth(id, parentOf)
		if err != nil {
			return nil, err
		}

		code := m["code"]
		name := m["name"] + m["suffix"]
		if override, ok := nameOverrides[code]; ok && level == 1 {
			name = override
		}

		nameEN, err := englishName(id, code, m["pinyin"], m["suffix"])
		if err != nil {
			return nil, fmt.Errorf("%s(id=%d): %w", name, id, err)
		}

		// 直辖市的直接下级在数据集里是 level 2(区),但真实层级是区县。
		// 把它们挂到合成的市级节点下,层级顺延成 3。
		if cityID, ok := syntheticCity[pid]; ok {
			pid = cityID
			level = 3
		}

		records = append(records, record{
			ID: id, ParentID: pid, Level: level,
			Code: code, Name: name, NameEN: nameEN,
			Pinyin: m["pinyin"], SortOrder: toInt(m["order"]),
		})

		// 省级自己是直辖市的话,顺手把合成的市级节点也生成出来
		if cityID, ok := syntheticCity[id]; ok {
			records = append(records, record{
				ID: cityID, ParentID: id, Level: 2,
				Code: municipalities[code], Name: name, NameEN: nameEN,
				Pinyin: m["pinyin"], SortOrder: 1,
			})
		}
	}

	sort.Slice(records, func(i, j int) bool { return records[i].ID < records[j].ID })
	return records, nil
}

// depth 顺着 parent_id 往上数,得出层级。顺便就把成环/断链的脏数据挡住了。
func depth(id int, parentOf map[int]int) (int, error) {
	level := 1
	for p := parentOf[id]; p != 0; p = parentOf[p] {
		if _, ok := parentOf[p]; !ok {
			return 0, fmt.Errorf("id=%d 的上级 %d 不存在", id, p)
		}
		level++
		if level > 3 {
			return 0, fmt.Errorf("id=%d 的层级超过 3,数据可能成环", id)
		}
	}
	return level, nil
}

// englishName 优先查覆盖表,查不到就用「拼音首字母大写 + 后缀译名」。
func englishName(id int, code, pinyin, suffix string) (string, error) {
	if en, ok := enByID[id]; ok {
		return en, nil
	}
	if en, ok := enByCode[code]; ok && code != "" {
		return en, nil
	}
	en, ok := suffixEN[suffix]
	if !ok {
		return "", fmt.Errorf("后缀 %q 没有对应的英文译名,请补 suffixEN", suffix)
	}
	base := capitalize(pinyin)
	if base == "" {
		return "", fmt.Errorf("pinyin 为空,无法生成英文名")
	}
	if en == "" {
		return base, nil
	}
	return base + " " + en, nil
}

func capitalize(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func toInt(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// writeSQL 输出成整表重灌的脚本:TRUNCATE 再批量 INSERT。
// 行政区划是纯字典数据,没有业务外键指过来(addresses 表存的是中文名字符串),
// 所以重灌是安全的,也省掉了增量比对的复杂度。
func writeSQL(path string, records []record) error {
	const batch = 200

	var b strings.Builder
	b.WriteString(`-- 本文件由 cmd/regionseed 生成,不要手改。
-- 数据源: https://github.com/eduosi/district (Apache-2.0)
--   快照 commit 5202a44613461c6e556fba50f4764ce6b1fdaef7 (2026-01-22)
--
-- 用法(先执行过 schema.sql):
--   psql "$DSN" -f seed_regions.sql
--
-- 整表重灌。行政区划是只读字典,addresses 表存的是中文名字符串而非外键,
-- 所以 TRUNCATE 不会牵连任何业务数据。

BEGIN;

SET search_path TO addresses;

TRUNCATE TABLE regions;

`)

	for i := 0; i < len(records); i += batch {
		end := min(i+batch, len(records))
		b.WriteString("INSERT INTO regions (id, parent_id, level, code, name, name_en, pinyin, sort_order) VALUES\n")
		for j, r := range records[i:end] {
			sep := ","
			if j == end-i-1 {
				sep = ";"
			}
			fmt.Fprintf(&b, "  (%d, %d, %d, %s, %s, %s, %s, %d)%s\n",
				r.ID, r.ParentID, r.Level,
				quote(r.Code), quote(r.Name), quote(r.NameEN), quote(r.Pinyin),
				r.SortOrder, sep)
		}
		b.WriteString("\n")
	}

	b.WriteString("COMMIT;\n")
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

func quote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
