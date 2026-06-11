{{- define "library.secret" -}}
{{- $secretName := .secret.name -}}
{{- $data := .secret.data -}}
---
apiVersion: v1
kind: Secret
metadata:
  name: {{ $secretName }}
type: Opaque
data:
  {{- range $key, $value := $data }}
  {{ $key }}: {{ $value | b64enc | quote }}
  {{- end }}
{{- end -}}
