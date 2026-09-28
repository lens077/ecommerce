package structcheck

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// 本文件把 STACK.md §三「依赖方向铁律」`server → service → biz ← data` 固化成门禁。
//
// 触发背景（2026-09-27）：对照一个同为「领域层定义仓储接口、基础设施实现」的 Go 项目做架构评审，
// 对方靠约定维持分层，领域服务层已有 3 个文件直接 import 持久化实现。回查本仓发现同样只靠约定：
// structcheck 管 matrix、网关、部署、kit 边界，却没有一条检查 import 方向。首次运行即查出
// 2 处存量违规（见 layerImportExemptions），说明约定已经在无声地松动。
//
// 判定按 import 路径（go/parser 只解析 import 块），不按字符串搜索：注释、字符串字面量不会误报；
// _test.go 不在检查范围——测试可以为装配跨层引用，生产代码不行。

const moduleServicesPrefix = "github.com/lens077/ecommerce/backend/services/"

// 各层都不该直接碰的存储驱动与连接实现：它们只属于 data 层（连接构建本身又只属于 kit，见
// TestConnectionBuildersLiveInKit）。
var storageImports = []string{
	"database/sql",
	"github.com/jackc/pgx",
	"github.com/redis/go-redis",
	"github.com/elastic/go-elasticsearch",
	"github.com/lens077/go-connect-kit/pgpool",
	"github.com/lens077/go-connect-kit/redisclient",
	"github.com/lens077/go-connect-kit/dbutil",
}

// 第三方服务的 SDK 与本仓对它们的封装：同样只属于 data 层（STACK.md：data 实现「第三方」）。
// 新接入外部服务时把它的 SDK 路径加进来，否则领域层可以悄悄依赖它。
var thirdPartyImports = []string{
	"github.com/casdoor/casdoor-go-sdk",
	"github.com/smartwalle/alipay",
	"github.com/lens077/ecommerce/backend/pkg/gorse",
	"github.com/lens077/ecommerce/backend/pkg/searchindex",
}

// 对外契约与传输协议：只有 service（proto ⇄ biz 转换）和 server（注册 handler）可以碰。
var transportImports = []string{
	"github.com/lens077/ecommerce/backend/api",
	"connectrpc.com",
}

// layerRule 描述 internal/<layer>/ 下生产代码禁止的 import。
// siblings 是同服务内禁止引用的其他层（相对 internal/ 的目录名）。
type layerRule struct {
	siblings []string
	external [][]string
	why      string
}

// 未列出的层（server、pkg、conf、eventbus、tests）不受此检查约束：server 是装配层，
// 健康检查需要 import data；biz 可以 import conf/v1——它是配置 schema，不是对外契约。
var layerRules = map[string]layerRule{
	"biz": {
		siblings: []string{"data", "service", "server"},
		external: [][]string{storageImports, thirdPartyImports, transportImports},
		why:      "biz 定义领域模型与 Repo 接口，不认识存储、第三方 SDK 和 RPC 契约",
	},
	"service": {
		siblings: []string{"data", "server"},
		external: [][]string{storageImports, thirdPartyImports},
		why:      "service 只做 proto ⇄ biz 转换与错误码映射，经 biz 用例访问数据，不越层直连 data",
	},
	"data": {
		siblings: []string{"service", "server"},
		external: [][]string{transportImports},
		why:      "data 实现 biz 的 Repo 接口，返回领域错误；RPC 错误码由 service 映射（docs/design/platform/error-handling.md）",
	},
}

type layerImport struct {
	file string // 相对 backend/services/ 的 slash 路径
	imp  string
}

// layerImportExemptions 是存量违规的棘轮清单：只许删，不许加。
// 修掉违规后这里的条目会被判为过期并报错，提示删除；新违规不能靠加条目放行，要改代码。
var layerImportExemptions = map[layerImport]string{
	{"user/internal/biz/user.go", "github.com/casdoor/casdoor-go-sdk/casdoorsdk"}: "GetUserProfileResponse 直接嵌 casdoorsdk.User；" +
		"应在 biz 定义 UserProfile，由 data 从 SDK 类型映射，service 再映射到 casdoorv1.User",
	{"payment/internal/data/payment.go", "connectrpc.com/connect"}: "5 个未实现方法在 data 层返回 connect.CodeUnimplemented，" +
		"service/payment_test.go 断言原样透传；应改为 biz 定义 ErrNotImplemented、service 映射错误码",
}

func matchesImportPrefix(path, prefix string) bool {
	return path == prefix || strings.HasPrefix(path, prefix+"/")
}

func TestLayerImportDirection(t *testing.T) {
	services := loadMatrix(t).Services
	names := make([]string, 0, len(services))
	for name := range services {
		names = append(names, name)
	}
	sort.Strings(names)

	seen := map[layerImport]bool{}
	for _, service := range names {
		internalDir := filepath.Join(servicesDir, service, "internal")
		scanned := map[string]int{}

		err := filepath.WalkDir(internalDir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return err
			}
			rel, err := filepath.Rel(internalDir, path)
			if err != nil {
				return err
			}
			layer, _, _ := strings.Cut(filepath.ToSlash(rel), "/")
			rule, ok := layerRules[layer]
			if !ok {
				return nil
			}
			scanned[layer]++

			file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
			if err != nil {
				return err
			}
			relFile, err := filepath.Rel(servicesDir, path)
			if err != nil {
				return err
			}
			relFile = filepath.ToSlash(relFile)

			for _, spec := range file.Imports {
				imp, err := strconv.Unquote(spec.Path.Value)
				if err != nil {
					return err
				}
				var forbidden []string
				for _, sibling := range rule.siblings {
					forbidden = append(forbidden, moduleServicesPrefix+service+"/internal/"+sibling)
				}
				for _, group := range rule.external {
					forbidden = append(forbidden, group...)
				}
				for _, prefix := range forbidden {
					if !matchesImportPrefix(imp, prefix) {
						continue
					}
					key := layerImport{relFile, imp}
					if _, exempt := layerImportExemptions[key]; exempt {
						seen[key] = true
						break
					}
					t.Errorf("%s import %q：%s（STACK.md §三 依赖方向铁律 server → service → biz ← data）",
						relFile, imp, rule.why)
					break
				}
			}
			return nil
		})
		if err != nil {
			t.Fatalf("扫描 %s: %v", internalDir, err)
		}

		// 防空转：层目录被改名或挪走时，上面的循环会静默地什么都不查。
		for layer := range layerRules {
			if scanned[layer] == 0 {
				t.Errorf("%s/internal/%s 下没有生产代码可查；层目录改名后请同步 layerRules，否则这道门禁形同虚设",
					service, layer)
			}
		}
	}

	for key, reason := range layerImportExemptions {
		if !seen[key] {
			t.Errorf("豁免已过期：%s 不再 import %q（原因：%s）；从 layerImportExemptions 删除这一条",
				key.file, key.imp, reason)
		}
	}
}
