import { testStoreContract } from "@community-os/testkit";
import { MemoryStore } from "./memory-store.ts";

testStoreContract("MemoryStore", () => new MemoryStore());
