{{- define "library.deployment" -}}
{{- if .enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .serviceName }}
spec:
  replicas: {{ .replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .serviceName }}
      app.kubernetes.io/instance: {{ .serviceName }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .serviceName }}
        app.kubernetes.io/instance: {{ .serviceName }}
    spec:
      {{- with .imagePullSecrets }}
      # TCR 是私有仓库，没有它 Pod 起不来。此前靠 `kubectl patch serviceaccount
      # default -n ecommerce` 注入，那是集群里的一处不在 Git 的手工状态：
      # 换命名空间、重建集群、或哪天有人重置了 SA 就静默失效。声明在这里，
      # ArgoCD 能自愈，也能被 diff 看见
      imagePullSecrets:
        {{- range . }}
        - name: {{ .name }}
        {{- end }}
      {{- end }}
      containers:
        - name: {{ .serviceName }}
          image: "{{ .repository }}:{{ .image.tag }}"
          imagePullPolicy: {{ .image.pullPolicy }}
          {{- with .env }}
          env:
            {{- range . }}
            - name: {{ .name }}
              {{- if .value }}
              value: {{ .value | quote }}
              {{- else if .valueFrom }}
              valueFrom:
                {{- toYaml .valueFrom | nindent 16 }}
              {{- end }}
            {{- end }}
          {{- end }}
          ports:
            {{- if .service.ports.http.enabled }}
            - name: http
              containerPort: {{ .service.ports.http.targetPort }}
              protocol: TCP
            {{- end }}
            {{- if .service.ports.grpc.enabled }}
            - name: grpc
              containerPort: {{ .service.ports.grpc.targetPort }}
              protocol: TCP
            {{- end }}
          resources:
            {{- toYaml .resources | nindent 12 }}
          {{- if and .dbCaCert .dbCaCert.enabled }}
          volumeMounts:
            - name: db-ca-cert
              mountPath: {{ .dbCaCert.mountPath }}
              readOnly: true
      volumes:
        - name: db-ca-cert
          secret:
            secretName: {{ .dbCaCert.secretName }}
          {{- end }}
{{- end }}
{{- end -}}
