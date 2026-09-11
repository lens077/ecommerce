# 2026-09-09 crane 参考：无 daemon 的镜像仓库操作工具

> 用户提问语境：「crane 是做什么的？为什么可以跳过 docker build？如何使用它」。本文回答三件事：**crane 是什么、为什么不需要 docker build**；**在本仓发布链（`service-ci.yml`）里哪些步骤适合它、哪些不适合**；**常用命令**。
> 结论先行：**参考项，不改现行 Buildx 发布链**。本仓 Dockerfile 的最终层有 `RUN apk upgrade` 与建用户等需要执行命令的步骤，crane 不能替代这类构建；它的价值在发布链的**仓库侧动作**——digest 解析、跨仓复制、tag 存在性断言、清点断言、同 digest 晋级——这些正是 [CI 复盘报告](2026-09-02-ci-two-remotes-dsh-reference.md) 表二列出的待办。
> 关联事实：本仓没有任何文件引用 crane（2026-09-09 全仓 grep）；本文命令均为通用用法，未在本仓 CI 里跑过，接入前须按 §五逐条验证。

## 一、crane 是什么

crane 是 Google [go-containerregistry](https://github.com/google/go-containerregistry) 项目附带的命令行工具，通过 Registry HTTP API（OCI Distribution Spec）直接读写镜像仓库里的镜像。它把镜像当作标准数据结构处理：一份 manifest、一份 config JSON、若干 layer tar 包，全部按内容寻址（digest）。

它不依赖 Docker daemon：不需要 `/var/run/docker.sock`，不需要 root，不需要本地镜像存储。所有动作要么是 HTTP 请求，要么是本地计算 digest。

主要能力按对象分组：

| 对象 | 命令 | 作用 |
|---|---|---|
| 镜像整体 | `pull` / `push` / `copy` | 与本地 tarball 互转；两个仓库之间直接复制（不落地） |
| 层 | `append` / `flatten` / `export` / `rebase` | 追加一层生成新镜像；压平所有层；导出扁平 rootfs；替换基础镜像 |
| config | `mutate` | 改 entrypoint、cmd、env、labels、user、workdir、annotations |
| 元数据 | `digest` / `manifest` / `config` / `ls` / `tag` / `delete` | 读 digest、manifest、config；列 tag；打 tag；删 manifest |
| 多架构 | `index append` / `index filter` / `--platform` | 组装或裁剪 manifest list；按平台选子镜像 |
| 认证 | `auth login` / `auth get` | 登录；读取 `~/.docker/config.json` 已有凭据 |

## 二、为什么可以跳过 docker build

`docker build` 做的事是「执行 Dockerfile 指令 → 每条产生新层 → 打包」，其中 `RUN` 需要真正启动容器，因此必须有 daemon（或 BuildKit / kaniko 这类替代执行器）。

镜像本身只是「文件系统层 + config JSON」。当构建产物已经存在（编译好的静态二进制、静态站点、`node_modules` 目录），把它变成镜像只需三步，每步都是纯数据操作：

1. 从仓库拉取基础镜像的 manifest 与 config；layer 本身不需要下载。
2. 把产物目录打成 tar 作为新 layer，计算 digest 后上传 blob。
3. 生成新的 config 与 manifest（引用基础镜像的旧 layer digest 与新 layer digest），推送。

所以 crane 能跳过 docker build 的前提是：**镜像 = 基础镜像 + 复制文件，没有任何需要在容器内执行的步骤**。未变化的 layer 由仓库端 blob mount 直接复用，不重传。

不适用的情况：Dockerfile 里有 `RUN apt-get install`、`RUN apk upgrade`、`RUN adduser` 这类需要运行命令的步骤。这些步骤只能由 Buildx、kaniko、buildah 等执行器完成。

## 三、对照本仓发布链：哪些步骤适合 crane

本仓后端 10 个服务共用一份 Dockerfile 模板（`backend/services/<svc>/Dockerfile`）：Go 编译层用 `--platform=$BUILDPLATFORM` 交叉编译，最终层是 `alpine:3.24` + `apk upgrade` + `apk add libc6-compat` + 建 `appuser`。发布由 `.github/workflows/service-ci.yml` 承担：Buildx 多架构构建 → 一次推 TCR 与 GHCR 两个仓 → 从 index digest 解析 amd64/arm64 子 digest → Syft SBOM → Trivy 扫描 → Cosign 签名。

| 发布链步骤 | 现行实现 | crane 能否替代 | 判断 |
|---|---|---|---|
| 构建最终镜像 | Buildx + QEMU 模拟 arm64 跑 `apk upgrade` | **不能**：`RUN` 步骤必须有执行器 | 不改。若将来最终层改为无 `RUN` 的静态基础镜像（如 distroless static，`CGO_ENABLED=0` 已满足前提），才可用 `crane append` 每架构各追加一层再 `crane index append` 组装，从而去掉 QEMU；但 `apk upgrade` 是 Trivy 门禁要求的（Dockerfile 注释记录了 2026-08-29 的 CVE 案例），换基础镜像前要先确认新基础镜像的 CVE 补丁节奏 |
| 推两个仓库 | 同一次 Buildx 推两个 registry | 可选：只推 GHCR，再 `crane copy` 到 TCR | 现行方式更简单；`crane copy` 的价值在「先在一个仓验完签名，再复制到另一个仓」时保证两处 digest 逐字节一致 |
| 解析多架构子 digest | `docker buildx imagetools inspect --raw` + `jq` | 可以：`crane manifest <image>@<digest>` 输出同一份 raw index | 等价替换；不依赖 Buildx 时可用 |
| 推镜像前断言 `X.Y.Z` tag 不存在 | 无（复盘报告表二 #2 待办；`docker push` 对已有 tag 静默覆盖） | **适合**：`crane digest <repo>:<ver>` 成功即已存在，应阻断 | 见 §四 |
| 回写前清点「N 个服务 → N 个 `X.Y.Z`」 | 无（复盘报告表二 #4 待办） | **适合**：对 `.service-matrix.yaml` 每个服务跑 `crane digest` | 见 §四 |
| 同一 digest 晋级 `dev → prod` 不重新构建 | [DEVOPS.md](../DEVOPS.md) §4 已定原则，无工具落地 | **适合**：`crane tag <repo>@<digest> <env-tag>` 或 `crane copy` | 只打 tag 不动 blob，Cosign 签名随 digest 保留 |
| 从不可变 digest 做运行时冒烟 | 无（复盘报告表二 #3 待办） | 不能：crane 不运行容器 | 仍需 `docker run` 或集群侧 Job |
| 基础镜像 CVE 修补 | 重跑整条流水线 | 部分：`crane rebase` 可只换基础层不重编译 | 本仓最终层含 `RUN`，rebase 后 `apk upgrade` 产生的层会失效；不适用现行 Dockerfile |

小结：crane 在本仓的定位是**发布链的仓库侧断言与搬运工具**，不是构建工具。

## 四、常用命令

### 安装与登录

```sh
brew install crane
# 或
go install github.com/google/go-containerregistry/cmd/crane@latest

crane auth login ghcr.io -u <user> -p <token>
crane auth login ccr.ccs.tencentyun.com -u <user> -p <password>
# 已用 docker login 登录过的仓库会直接复用 ~/.docker/config.json
```

CI 里也可用 `docker/login-action` 登录后直接调 crane，凭据来源相同。

### 仓库侧断言（对应复盘报告待办）

```sh
# 推送前：版本 tag 必须不存在，否则视为重复发布并阻断
if crane digest "ghcr.io/lens077/user:1.7.0" >/dev/null 2>&1; then
  echo "tag 1.7.0 already exists" >&2; exit 1
fi

# 回写清单前：矩阵里每个服务都必须已有该版本
for svc in $(yq '.services | keys | .[]' .service-matrix.yaml); do
  crane digest "ccr.ccs.tencentyun.com/sumery/${svc}:1.7.0" >/dev/null
done
```

`.service-matrix.yaml` 的 `services` 是以服务名为键的映射；`backend.yml` 矩阵若另有过滤（例如排除未产镜像的服务），清点集合应与矩阵一致。

### 读取元数据

```sh
crane ls ghcr.io/lens077/user                       # 列 tag
crane digest ghcr.io/lens077/user:1.7.0             # index digest
crane manifest ghcr.io/lens077/user:1.7.0 | jq .    # raw index，含各平台子 digest
crane config ghcr.io/lens077/user:1.7.0 --platform linux/arm64 | jq .
crane export ghcr.io/lens077/user:1.7.0 - --platform linux/arm64 | tar -tvf - | head
```

### 搬运与晋级

```sh
# 跨仓复制，digest 逐字节一致
crane copy ghcr.io/lens077/user:1.7.0 ccr.ccs.tencentyun.com/sumery/user:1.7.0

# 按 digest 打环境 tag，不动 blob
crane tag ccr.ccs.tencentyun.com/sumery/user@sha256:<digest> prod
```

### 不经 docker build 组装镜像（本仓当前不适用，留作参考）

```sh
# 产物目录结构即镜像内绝对路径
mkdir -p rootfs/app && cp ./dist/server rootfs/app/server
tar -C rootfs -cf layer.tar .

crane append \
  --base gcr.io/distroless/static:nonroot \
  --new_layer layer.tar \
  --new_tag ghcr.io/lens077/server:1.7.0 \
  --platform linux/arm64

crane mutate ghcr.io/lens077/server:1.7.0 \
  --entrypoint /app/server \
  --env CONFIG_PATH=/app/configs/config.yaml \
  --user 1000:1000 \
  -t ghcr.io/lens077/server:1.7.0
```

多架构时每个平台各 `append` 一次，再用 `crane index append -m <amd64-ref> -m <arm64-ref> -t <index-tag>` 组装。`mutate` 会产生新 digest，签名与 SBOM 必须在 `mutate` 之后做。

## 五、接入前须验证的事项

1. **TCR 兼容性**：TCR 个人版对 OCI 标准 API 的支持是有边界的实测结论（见 [供应链演变全景](2026-08-28-supply-chain-evolution-overview.md)）。`crane copy` / `crane tag` 在 TCR 上的行为需要用 `user` 服务先探测，与 Cosign 探测的做法一致。
2. **两远端硬约束**：任何 crane 写操作（`copy` / `tag` / `push`）只能出现在 GitHub 发布链里；GitLab 侧保持只读（[git-commit.md](../../context/team/git-commit.md)「两个远端的 CI 职责切分」）。
3. **版本固定**：CI 里安装 crane 应固定版本并校验 checksum，做法与 `scripts/install-cosign.sh` 对齐。
4. **`crane delete` 不进 CI**：不可变 tag 纪律下没有合法的删除场景。

## 六、证据与来源

- [go-containerregistry 仓库](https://github.com/google/go-containerregistry)
- [crane 命令文档](https://github.com/google/go-containerregistry/blob/main/cmd/crane/doc/crane.md)
- 本仓发布链：`.github/workflows/service-ci.yml`、`backend/services/*/Dockerfile`
- 待办出处：[CI 复盘报告](2026-09-02-ci-two-remotes-dsh-reference.md) 表二 #2、#3、#4
