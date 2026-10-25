// The application moved to packages/server so the SDK can serve it
// in-process (cos.serve()). This shim keeps the api workspace's import
// surface stable — index.ts, node.ts, and the test suite import from here.
export {
  createApp,
  memoryStore,
  type AppEnv,
  type AppOptions,
  type WebhookDelivery,
} from "@community-os/server";
