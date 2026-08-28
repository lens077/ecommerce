/**
 * 提交信息校验规则。由 frontend/.vite-hooks/commit-msg 在每次 git commit 时调用（2026-08-26 自仓库根迁入 frontend workspace，原头注释的 .husky 路径系陈旧残留）。
 *
 * 格式：<type>(<scope>): [:emoji:] <subject>
 *
 * 遵循 Angular / Conventional Commits。emoji 可选 —— 仓库既有历史全部不带，
 * 强制加上会让 `git log --oneline` 一半带一半不带，更乱。但**一旦带了就必须对**：
 * 既要在白名单里，也要和 type 相符。写 `feat: :bug: xxx` 说明作者自己都没想清楚
 * 这次改动到底是加功能还是修 bug，那正是 type 该表达的信息。
 *
 * emoji 语义以 gitmoji.dev 官方定义为准，不是望文生义。
 */

/**
 * emoji → 允许搭配的 type。
 *
 * 一个 emoji 可以对应多个 type：`:necktie:`（业务逻辑）新写是 feat、改错是 fix、
 * 只挪不改行为是 refactor，三种都成立。所以值是数组而不是单个 type。
 * 但 `:bug:` 只能是 fix、`:sparkles:` 只能是 feat —— 这类没有第二种读法。
 */
export const EMOJI_TYPES = {
  // ---- feat 主场 ----
  ":sparkles:": ["feat"], // 引入新特性
  ":boom:": ["feat", "refactor"], // 破坏性变更
  ":globe_with_meridians:": ["feat", "fix"], // 国际化与本地化
  ":chart_with_upwards_trend:": ["feat"], // 添加或更新分析、埋点代码
  ":speech_balloon:": ["feat", "docs", "style"], // 添加或更新文案与字面量
  ":triangular_flag_on_post:": ["feat", "chore"], // 添加、更新或删除特性开关
  ":egg:": ["feat"], // 添加或更新彩蛋
  ":seedling:": ["feat", "chore"], // 添加或更新种子数据

  // ---- 跨 feat / fix / refactor ----
  ":necktie:": ["feat", "fix", "refactor"], // 添加或更新业务逻辑
  ":safety_vest:": ["feat", "fix", "refactor"], // 添加或更新校验相关代码
  ":passport_control:": ["feat", "fix"], // 授权、角色与权限相关代码
  ":stethoscope:": ["feat", "chore"], // 添加或更新健康检查
  ":card_file_box:": ["feat", "fix", "chore"], // 数据库相关变更
  ":loud_sound:": ["feat", "chore"], // 添加或更新日志
  ":goal_net:": ["feat", "fix"], // 捕获错误
  ":thread:": ["feat", "fix", "perf", "refactor"], // 多线程与并发相关代码
  ":wheelchair:": ["feat", "fix"], // 提升可访问性
  ":label:": ["feat", "refactor", "chore"], // 添加或更新类型

  // ---- fix 主场 ----
  ":bug:": ["fix"], // 修复 bug
  ":ambulance:": ["fix"], // 关键热修复
  ":adhesive_bandage:": ["fix"], // 非关键问题的简单修复
  ":pencil2:": ["fix", "docs"], // 修复拼写错误
  ":lock:": ["fix"], // 修复安全或隐私问题
  ":rotating_light:": ["fix", "style", "chore"], // 修复编译器或 linter 告警
  ":alien:": ["fix", "refactor"], // 因外部 API 变更而修改代码

  // ---- perf ----
  ":zap:": ["perf"], // 提升性能
  ":mag:": ["perf", "feat"], // 改进 SEO
  ":children_crossing:": ["perf", "feat", "fix"], // 改善用户体验与可用性

  // ---- refactor ----
  ":recycle:": ["refactor"], // 重构代码
  ":building_construction:": ["refactor"], // 架构变更
  ":art:": ["refactor", "style"], // 改进代码结构与格式
  ":truck:": ["refactor", "chore"], // 移动或重命名资源
  ":coffin:": ["refactor", "chore"], // 删除死代码
  ":fire:": ["refactor", "chore"], // 删除代码或文件
  ":wastebasket:": ["refactor", "chore"], // 弃用需要清理的代码
  ":mute:": ["refactor", "chore"], // 删除日志

  // ---- style ----
  ":lipstick:": ["style", "feat"], // 添加或更新 UI 与样式文件
  ":iphone:": ["style", "feat"], // 响应式设计
  ":dizzy:": ["style", "feat"], // 添加或更新动画与过渡

  // ---- test ----
  ":white_check_mark:": ["test"], // 添加、更新或让测试通过
  ":test_tube:": ["test"], // 添加一个失败的测试
  ":clown_face:": ["test"], // mock 数据
  ":camera_flash:": ["test"], // 添加或更新快照

  // ---- build ----
  ":heavy_plus_sign:": ["build"], // 添加依赖
  ":heavy_minus_sign:": ["build"], // 移除依赖
  ":arrow_up:": ["build"], // 升级依赖
  ":arrow_down:": ["build"], // 降级依赖
  ":pushpin:": ["build"], // 将依赖锁定到指定版本
  ":package:": ["build"], // 添加或更新编译产物与分发包
  ":bricks:": ["build", "chore", "feat"], // 基础设施相关变更

  // ---- ci ----
  ":construction_worker:": ["ci"], // 添加或更新 CI 构建系统
  ":green_heart:": ["ci", "fix"], // 修复 CI 构建
  ":rocket:": ["ci", "chore"], // 部署

  // ---- docs ----
  ":memo:": ["docs"], // 添加或更新文档
  ":bulb:": ["docs", "refactor"], // 添加或更新源码注释
  ":page_facing_up:": ["docs", "chore"], // 添加或更新许可证
  ":busts_in_silhouette:": ["docs", "chore"], // 添加或更新贡献者
  ":money_with_wings:": ["docs", "chore"], // 添加赞助或资金相关

  // ---- revert ----
  ":rewind:": ["revert"], // 回退变更

  // ---- chore ----
  ":wrench:": ["chore", "build"], // 添加或更新配置文件
  ":hammer:": ["chore", "build"], // 添加或更新开发脚本
  ":closed_lock_with_key:": ["chore"], // 添加或更新密钥
  ":see_no_evil:": ["chore"], // 添加或更新 .gitignore
  ":bento:": ["chore", "feat"], // 添加或更新静态资源
  ":construction:": ["chore"], // 工作进行中
  ":twisted_rightwards_arrows:": ["chore"], // 合并分支
  ":alembic:": ["chore", "feat"], // 进行实验
  ":monocle_face:": ["chore"], // 数据探查与检查
  ":technologist:": ["chore"], // 改善开发者体验
  ":tada:": ["chore", "feat"], // 初始化项目
  ":poop:": ["chore", "fix"], // 写下待改进的糟糕代码
};

/** subject 开头的 `:emoji_name:` —— gitmoji 短代码只含小写字母、数字、下划线、加减号 */
const LEADING_EMOJI = /^(:[a-z0-9_+-]+:)\s*/;

/**
 * 校验 subject 里的 emoji：白名单 + 与 type 相符。
 *
 * 只认短代码形式（`:bug:`），不认 Unicode 字面量（🐛）。终端字体、diff 工具和
 * `git log` 的对齐对宽字符处理各不相同，短代码是纯 ASCII，到哪都不会错位。
 */
const emojiRule = ({ type, subject }) => {
  if (!subject) return [true];

  const hit = LEADING_EMOJI.exec(subject);
  if (!hit) return [true]; // 不带 emoji —— 合法

  const emoji = hit[1];
  const allowed = EMOJI_TYPES[emoji];

  if (!allowed) {
    return [
      false,
      `${emoji} 不在白名单里。可用清单见 context/team/git-commit.md，语义以 gitmoji.dev 为准`,
    ];
  }

  if (!allowed.includes(type)) {
    return [
      false,
      `${emoji} 只能配 ${allowed.join(" / ")}，不能配 ${type}。` +
        `如果这次改动确实是 ${type}，换一个 emoji 或者干脆不写`,
    ];
  }

  return [true];
};

/**
 * subject 末尾不留标点。
 *
 * 内置的 subject-full-stop 只能配一个字符，而本仓 subject 以中文为主，
 * 真正会误写的是全角句号「。」和感叹号，ASCII 的 `.` 反而少见。
 */
const TRAILING_PUNCT = /[.。，,;；!！?？、]$/;

const noTrailingPunct = ({ subject }) => {
  if (!subject || !TRAILING_PUNCT.test(subject)) return [true];
  return [false, `subject 末尾不要加标点（这里是「${subject.slice(-1)}」）`];
};

export default {
  extends: ["@commitlint/config-conventional"],

  plugins: [
    {
      rules: {
        "gitmoji-type-match": emojiRule,
        "subject-no-trailing-punctuation": noTrailingPunct,
      },
    },
  ],

  rules: {
    // Angular 的十一类，一个不多一个不少
    "type-enum": [
      2,
      "always",
      [
        "feat", // 新功能
        "fix", // 修 bug
        "perf", // 性能优化
        "refactor", // 既不加功能也不修 bug 的代码变动
        "style", // 不影响语义的格式、UI 样式
        "test", // 测试
        "docs", // 文档
        "build", // 构建系统或依赖
        "ci", // CI 配置与脚本
        "chore", // 杂项，以上都不是
        "revert", // 回退
      ],
    ],

    "gitmoji-type-match": [2, "always"],

    // 正文和 footer 放宽到 200。config-conventional 默认 100 是按英文定的，
    // 而中文一行 100 字符信息量约等于英文 250，卡 100 会逼着把话拆碎。
    "body-max-line-length": [2, "always", 200],
    "footer-max-line-length": [2, "always", 200],

    // subject 大小写不管 —— 本仓 subject 以中文为主，规则对中文没有意义，
    // 留着只会在偶尔写英文 subject 时莫名其妙地拦一下。
    "subject-case": [0],

    // 换成自定义版本：内置的只认单个字符，管不了中文全角标点
    "subject-full-stop": [0],
    "subject-no-trailing-punctuation": [2, "always"],
  },
};
