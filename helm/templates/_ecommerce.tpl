{{- /*
ecommerce 十个业务服务共用的模板。

与 backend/services/<svc>/deploy/dev/ 下的裸 manifest **逐字段等价**——两份是同一套集群
对象的两种写法(helm 给 GitOps/ArgoCD 用户,裸 manifest 给 kubectl 用户),由
scripts/verify-deploy-parity.sh 强制对齐:这里多一个字段、少一个 label、env 顺序不同,
门禁都会红。改这份模板时,同步改裸 manifest;反之亦然。

为什么放在 umbrella 的 templates/ 而不是原来的 library subchart:Helm 的命名模板是全局的,
子 chart 能直接 include 父 chart 的 define。原来的 library 要 `helm dependency build` 打成
tgz 塞进每个子 chart 并提交——源码改了、tgz 没重打,渲染的还是旧模板,而且没有任何报错。
structcheck 曾专门写一个测试去对比 tgz 里的模板和源码,那是给错误设计打的补丁。

调用方(各子 chart 的 templates/*.yaml)传入 dict:
  svc     子 chart 名(目录名),也是 Config Center selector 的 key
  values  该服务的 values(顶层 <svc>: 段)
  global  .Values.global
  ns      .Release.Namespace
*/ -}}

{{- define "ecommerce.deployment" -}}
{{- $svc := .svc -}}
{{- $v := .values -}}
{{- $g := .global -}}
{{- $res := $v.resources | default $g.resources -}}
{
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "ecommerce-{{ $svc }}-deploy",
    # 必须显式写 namespace —— ArgoCD 与 kubectl apply 才会落到同一个 ns,
    # Service/VPA/HTTPRoute 按名字回指时才找得到它。
    namespace: {{ .ns | quote }},
    labels: {
      app: "ecommerce-{{ $svc }}",
      app.kubernetes.io/part-of: "ecommerce",
    },
  },
  spec: {
    replicas: {{ $v.replicaCount }},
    selector: {
      matchLabels: {
        app: "ecommerce-{{ $svc }}",
      },
    },
    template: {
      metadata: {
        name: "ecommerce-{{ $svc }}",
        labels: {
          app: "ecommerce-{{ $svc }}",
          app.kubernetes.io/part-of: "ecommerce",
        },
      },
      spec: {
        # 10 个单副本 API 按整套 ecommerce 共同计数跨节点摊开,DoNotSchedule 让 maxSkew=1
        # 可强制;Honor 排除 affinity/taint 不可调度的节点。约定见 .service-matrix.yaml conventions。
        topologySpreadConstraints: [{
          maxSkew: 1,
          topologyKey: "kubernetes.io/hostname",
          whenUnsatisfiable: "DoNotSchedule",
          nodeAffinityPolicy: "Honor",
          nodeTaintsPolicy: "Honor",
          labelSelector: {
            matchLabels: {
              app.kubernetes.io/part-of: "ecommerce",
            },
          },
        }],
        # 专属身份,无 RoleBinding、不投射 token(见 helm/files/zero-trust.yaml)。
        serviceAccountName: "ecommerce-{{ $svc }}",
        automountServiceAccountToken: false,
        enableServiceLinks: false,
        securityContext: {
          runAsNonRoot: true,
          runAsUser: {{ $g.configSource.runAsUser }},
          runAsGroup: {{ $g.configSource.runAsGroup }},
          fsGroup: {{ $g.configSource.fsGroup }},
          fsGroupChangePolicy: "OnRootMismatch",
        },
        containers: [{
          name: "ecommerce-{{ $svc }}",
          image: "{{ $v.image.repository }}:{{ $v.image.tag }}",
          imagePullPolicy: "Always",
          env: [{
            # 关闭应用内的 Log 导出器,只保留 Trace 和 Metric。
            # 日志输出到 stdout,由部署在 k8s 的 Fluent Bit 统一采集
            name: "OTEL_LOGS_EXPORTER",
            value: "none",
          }, {
            # OTLP 鉴权头(Vault → ExternalSecret otel-auth)。optional=true:
            # Secret 未就绪时退回匿名发送而不是 CrashLoop。
            name: "OTEL_EXPORTER_OTLP_HEADERS",
            valueFrom: {
              secretKeyRef: {
                name: "otel-auth",
                key: "OTEL_EXPORTER_OTLP_HEADERS",
                optional: true,
              },
            },
          }, {
            # SERVICE_NAME 是注册进 Consul 的服务名,必须与 .service-matrix.yaml 的
            # discovery 逐字相同(≠ 目录名:user 是 user-identity,search 是 search-product)
            name: "SERVICE_NAME",
            value: {{ $v.serviceName | quote }},
          }, {
            name: "SERVICE_VERSION",
            value: {{ $v.serviceVersion | default "v1" | quote }},
          }, {
            name: "DEPLOYMENT_MODE",
            value: {{ $g.deploymentMode | quote }},
          }, {
            # Bootstrap 只从挂载的 Config Center selector 读取。
            name: "CONFIG_SOURCE_FILE",
            value: {{ printf "%s/%s.yaml" $g.configSource.mountPath $svc | quote }},
          }, {
            # Consul 只用于服务注册发现。2026-09-03 起显式关闭:当前不需要服务发现,
            # 保留接线以备将来启用——见
            # context/project/ecommerce/registry/experience/consul-register-once-then-give-up.md
            name: "CONSUL_ENABLED",
            value: {{ $g.consul.enabled | quote }},
          }, {
            name: "CONSUL_ADDR",
            value: {{ $g.consul.addr | quote }},
          }, {
            name: "CONSUL_SCHEME",
            value: {{ $g.consul.scheme | quote }},
          }, {
            name: "CONSUL_INSECURE_SKIP_VERIFY",
            value: {{ $g.consul.insecureSkipVerify | quote }},
          }, {
            name: "CONSUL_HTTP_TOKEN",
            valueFrom: {
              secretKeyRef: {
                name: {{ $g.consul.tokenSecret | quote }},
                key: "CONSUL_HTTP_TOKEN",
              },
            },
          {{- range $v.extraEnv }}
          }, {{ toJson . }},
          {{- end }}
          }],
          ports: [{
            # 端口必须命名:Service 的 targetPort 按名字找,改端口号时只动 values 一处
            name: "http",
            containerPort: {{ $v.port }},
            protocol: "TCP",
          }],
          # /healthz 在 DB/缓存不通时返回 503。就绪探针据此摘流量;
          # 存活探针只探端口 —— 用 /healthz 做存活会让一次数据库抖动把所有 Pod 连环重启。
          readinessProbe: {
            httpGet: {
              path: "/healthz",
              port: {{ $v.port }},
            },
            initialDelaySeconds: 5,
            periodSeconds: 10,
            failureThreshold: 3,
          },
          livenessProbe: {
            tcpSocket: {
              port: {{ $v.port }},
            },
            initialDelaySeconds: 20,
            periodSeconds: 20,
            failureThreshold: 3,
          },
          # KYAML 不用 `toYaml | nindent` ——那是从 YAML 之外操纵缩进,正是 KYAML 要消除的写法。
          # 逐字段展开,结构由 {} 决定而不是由空格决定。
          resources: {
            requests: {
              cpu: {{ $res.requests.cpu | quote }},
              memory: {{ $res.requests.memory | quote }},
            },
            limits: {
              cpu: {{ $res.limits.cpu | quote }},
              memory: {{ $res.limits.memory | quote }},
            },
          },
          volumeMounts: [{
            name: "config-source",
            mountPath: {{ $g.configSource.mountPath | quote }},
            readOnly: true,
          }],
        }],
        volumes: [{
          name: "config-source",
          secret: {
            secretName: {{ $g.configSource.secretName | quote }},
            # = 0400 八进制。写十进制是因为 0400 在 YAML 1.1/1.2 下解析不同(256 vs 400),
            # kustomize 与 yq 会各读各的。KYAML 不改变这一点:它管引号不管进制,
            # 八进制歧义只能靠写十进制规避。
            defaultMode: 256,
            # Secret 是运维打包对象;每个 Pod 只投射自己的含 token selector。
            items: [{
              key: "{{ $svc }}.yaml",
              path: "{{ $svc }}.yaml",
            }],
          },
        }],
        restartPolicy: "Always",
      },
    },
  },
}
{{- end -}}

{{- define "ecommerce.service" -}}
{{- $svc := .svc -}}
{{- $v := .values -}}
{
  apiVersion: "v1",
  kind: "Service",
  metadata: {
    name: "ecommerce-{{ $svc }}-service",
    namespace: {{ .ns | quote }},
  },
  spec: {
    selector: {
      app: "ecommerce-{{ $svc }}",
    },
    ports: [{
      # 端口命名:targetPort 用名字回指容器端口,改容器端口时只动一处
      name: "http",
      protocol: "TCP",
      port: {{ $v.port }},
      targetPort: "http",
    }],
    # ClusterIP:入口统一走共享 cilium-gateway 的 HTTPRoute(control-tower 仓),
    # 不再为一个后端微服务单独占一个 LB IP。
    type: "ClusterIP",
  },
}
{{- end -}}

{{- define "ecommerce.vpa" -}}
{{- $svc := .svc -}}
{
  # 当前集群只安装 recommender,updateMode 必须保持 Off,仅生成 requests 推荐值。
  # 不写 minAllowed/maxAllowed:观测阶段要同时看到 Target 与 Uncapped Target。
  apiVersion: "autoscaling.k8s.io/v1",
  kind: "VerticalPodAutoscaler",
  metadata: {
    name: "ecommerce-{{ $svc }}-vpa",
    namespace: {{ .ns | quote }},
    labels: {
      app.kubernetes.io/part-of: "ecommerce",
      app.kubernetes.io/component: "capacity-recommendation",
    },
  },
  spec: {
    targetRef: {
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: "ecommerce-{{ $svc }}-deploy",
    },
    updatePolicy: {
      # KYAML 下这里**天然**是字符串:值一律带双引号。写块式 YAML 时漏掉这对引号,
      # 裸 Off 会被 YAML 1.1 解析成布尔 false,VPA 就从「只推荐」变成「真去改 Pod」。
      updateMode: "Off",
    },
    resourcePolicy: {
      containerPolicies: [{
        containerName: "ecommerce-{{ $svc }}",
        controlledResources: [
          "cpu",
          "memory",
        ],
        controlledValues: "RequestsOnly",
      }],
    },
  },
}
{{- end -}}


