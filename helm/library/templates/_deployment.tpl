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
