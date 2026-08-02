import { createClient } from "@connectrpc/connect";
import { ConfigService, ConfigFormat } from "@/gen/api";
import { createAppTransport } from "@ecommerce/api";

const transport = createAppTransport();

const client = createClient(ConfigService, transport);

export interface PutKeyInput {
  namespace: string;
  environment: string;
  key: string;
  format: ConfigFormat;
  value: string;
  comment?: string;
  isSecret?: boolean;
  description?: string;
}

export const configApi = {
  listNamespaces: (signal?: AbortSignal) => client.listNamespaces({}, { signal }),

  listKeys: (namespace: string, environment: string, keyPrefix = "", signal?: AbortSignal) =>
    client.listKeys({ namespace, environment, keyPrefix }, { signal }),

  getKey: (namespace: string, environment: string, key: string, signal?: AbortSignal) =>
    client.getKey({ namespace, environment, key }, { signal }),

  putKey: (input: PutKeyInput, signal?: AbortSignal) =>
    client.putKey(
      {
        namespace: input.namespace,
        environment: input.environment,
        key: input.key,
        format: input.format,
        value: input.value,
        comment: input.comment ?? "",
        isSecret: input.isSecret ?? false,
        description: input.description ?? "",
      },
      { signal },
    ),

  deleteKey: (namespace: string, environment: string, key: string, signal?: AbortSignal) =>
    client.deleteKey({ namespace, environment, key }, { signal }),

  listRevisions: (namespace: string, environment: string, key: string, signal?: AbortSignal) =>
    client.listRevisions({ namespace, environment, key }, { signal }),

  getRevision: (
    namespace: string,
    environment: string,
    key: string,
    version: number,
    signal?: AbortSignal,
  ) => client.getRevision({ namespace, environment, key, version }, { signal }),

  rollback: (
    namespace: string,
    environment: string,
    key: string,
    version: number,
    comment = "",
    signal?: AbortSignal,
  ) => client.rollback({ namespace, environment, key, version, comment }, { signal }),
};

export { ConfigFormat };
