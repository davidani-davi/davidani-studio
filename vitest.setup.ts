import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library's automatic teardown never
// registers itself and every render stacks up in the same document. Without
// this, the second component test in a file fails with "found multiple
// elements" and the fix looks like a query problem rather than a leak.
afterEach(cleanup);
