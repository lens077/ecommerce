import { proxy, subscribe } from "valtio";

// 编辑器/浏览器上下文:当前选择的命名空间、环境与 key。
export interface EditorState {
  namespace: string;
  environment: string;
  selectedKey: string | null;
  dirty: boolean;
}

const saved = localStorage.getItem("config_editor_ctx");
const initial: Pick<EditorState, "namespace" | "environment"> = saved
  ? JSON.parse(saved)
  : { namespace: "ecommerce", environment: "dev" };

export const editorStore = proxy<EditorState>({
  namespace: initial.namespace || "ecommerce",
  environment: initial.environment || "dev",
  selectedKey: null,
  dirty: false,
});

export const setNamespace = (ns: string) => {
  editorStore.namespace = ns;
};
export const setEnvironment = (env: string) => {
  editorStore.environment = env;
};
export const setSelectedKey = (key: string | null) => {
  editorStore.selectedKey = key;
};
export const setDirty = (v: boolean) => {
  editorStore.dirty = v;
};

// 仅持久化 namespace/environment
subscribe(editorStore, () => {
  localStorage.setItem(
    "config_editor_ctx",
    JSON.stringify({ namespace: editorStore.namespace, environment: editorStore.environment }),
  );
});
