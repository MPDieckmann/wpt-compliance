// wpt.config.ts — WPT configuration for testing fake-indexeddb
//
// This config wires up fake-indexeddb's pure-JS IndexedDB implementation
// as globals before every WPT test file, so the tests see the same API
// they would in a browser.

import { defineConfig } from "wpt-compliance";
import {
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from "fake-indexeddb";

export default defineConfig({
  IndexedDB: {
    // Global names that wpt-compliance will clean up between test files
    globals: [
      "indexedDB",
      "IDBCursor",
      "IDBCursorWithValue",
      "IDBDatabase",
      "IDBFactory",
      "IDBIndex",
      "IDBKeyRange",
      "IDBObjectStore",
      "IDBOpenDBRequest",
      "IDBRequest",
      "IDBTransaction",
      "IDBVersionChangeEvent",
    ],

    // Inject fake-indexeddb globals before each test file
    setup({ globalThis: g }) {
      const w = g as any;
      w.indexedDB = new IDBFactory();
      w.IDBCursor = IDBCursor;
      w.IDBCursorWithValue = IDBCursorWithValue;
      w.IDBDatabase = IDBDatabase;
      w.IDBFactory = IDBFactory;
      w.IDBIndex = IDBIndex;
      w.IDBKeyRange = IDBKeyRange;
      w.IDBObjectStore = IDBObjectStore;
      w.IDBOpenDBRequest = IDBOpenDBRequest;
      w.IDBRequest = IDBRequest;
      w.IDBTransaction = IDBTransaction;
      w.IDBVersionChangeEvent = IDBVersionChangeEvent;
    },

    // Reset between test files — create a fresh IDBFactory each time
    cleanup() {
      const w = globalThis as any;
      delete w.indexedDB;
      delete w.IDBCursor;
      delete w.IDBCursorWithValue;
      delete w.IDBDatabase;
      delete w.IDBFactory;
      delete w.IDBIndex;
      delete w.IDBKeyRange;
      delete w.IDBObjectStore;
      delete w.IDBOpenDBRequest;
      delete w.IDBRequest;
      delete w.IDBTransaction;
      delete w.IDBVersionChangeEvent;
    },

    // IndexedDB tests can be slow — give them 60 seconds
    timeout: 60_000,
  },
});
