import { describe, expect, it } from "vitest";
import { POSITIONS } from "./positions.js";

describe("approved positions", () => {
  it("are exactly the IT company positions", () => {
    expect([...POSITIONS]).toEqual(["Help Desk", "IT Technician", "Director", "Human Resources", "Administrator", "Network Engineer"]);
  });

  it("contain no leftover cash-handling job titles", () => {
    for (const position of POSITIONS) expect(position).not.toMatch(/cash|custod|supervisor/i);
  });
});
