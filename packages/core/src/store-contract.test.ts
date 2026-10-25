import { testStoreContract, testStoreModelConformance } from "@community-os/testkit";
import { MemoryStore } from "./memory-store.ts";

testStoreContract("MemoryStore", () => new MemoryStore());
testStoreModelConformance("MemoryStore", () => new MemoryStore());
