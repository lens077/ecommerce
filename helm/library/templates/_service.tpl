{{- define "library.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ .serviceName }}-service
spec:
  selector:
    app.kubernetes.io/name: {{ .serviceName }}
  type: {{ .serviceType }}
  ports:
    {{- range $name, $portCfg := .ports }}
    {{- if $portCfg.enabled }}
    - name: {{ $name }}
      port: {{ $portCfg.port }}
      targetPort: {{ $portCfg.targetPort }}
      protocol: TCP
    {{- end }}
    {{- end }}
{{- end }}
