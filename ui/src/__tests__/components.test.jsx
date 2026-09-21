import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { FidelityBadge } from "../components/FidelityBadge.jsx";
import { Band } from "../components/Band.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { applyTheme, storedTheme, THEMES } from "../components/ThemeToggle.jsx";
import { segmentsFor, discontinuities } from "../lib/trends.js";

describe("FidelityBadge", () => {
  test("throws when rendered without a grader — the invariant that keeps numbers comparable", () => {
    // No TypeScript here, so the rule is enforced at runtime. A silent default
    // is how an incomparable number reaches a slide.
    expect(() => render(<FidelityBadge value={70} />)).toThrow(/requires graderModel/);
  });

  test("renders the value together with its grader", () => {
    render(<FidelityBadge value={68.5} graderModel="claude-sonnet-5" probeCount={6} />);
    expect(screen.getByText("69")).toBeTruthy();
    expect(screen.getByText(/sonnet-5/)).toBeTruthy();
  });

  test("an unprobed page is stated, not shown as zero", () => {
    render(<FidelityBadge value={null} />);
    expect(screen.getByText("not probed")).toBeTruthy();
  });
});

describe("Band", () => {
  test("carries a text label, never colour alone", () => {
    const { container } = render(<Band band="Strong" />);
    expect(screen.getByText("Strong")).toBeTruthy();
    expect(container.querySelector(".band-strong")).toBeTruthy();
  });
});

describe("theme", () => {
  beforeEach(() => localStorage.clear());

  test("explicit choice overrides the OS in both directions", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
    // System removes the attribute so the media query governs again.
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  test("defaults to system and rejects junk", () => {
    expect(storedTheme({ getItem: () => null })).toBe("system");
    expect(storedTheme({ getItem: () => "purple" })).toBe("system");
    expect(THEMES).toContain("system");
  });
});

const rows = Array.from({ length: 60 }, (_, i) => ({
  key: `k${i}`,
  title: `Page ${i}`,
  score: i,
}));
const columns = [
  { key: "title", label: "Page" },
  { key: "score", label: "Score" },
];

function renderTable(initial = "/") {
  let search;
  function Probe() {
    [search] = useSearchParams();
    return null;
  }
  const utils = render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <DataTable rows={rows} columns={columns} searchKeys={["title"]} />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, getSearch: () => search };
}

describe("DataTable", () => {
  test("paginates rather than rendering everything", () => {
    renderTable();
    expect(screen.getByText("Page 0")).toBeTruthy();
    expect(screen.queryByText("Page 40")).toBeNull();
    expect(screen.getByText(/Page 1 of 3/)).toBeTruthy();
  });

  test("state round-trips through the URL so a view is shareable", () => {
    const { getSearch } = renderTable();
    fireEvent.click(screen.getByLabelText("Sort by Score"));
    expect(getSearch().get("sort")).toBe("score");
    fireEvent.click(screen.getByText("Next"));
    expect(getSearch().get("page")).toBe("2");
  });

  test("a pasted URL reproduces the view", () => {
    // Sort explicitly by score: the default sort is by title, which is a string
    // compare, so "Page 10" precedes "Page 2" and row order is not numeric.
    renderTable("/?sort=score&dir=asc&page=3&size=25");
    expect(screen.getByText(/Page 3 of 3/)).toBeTruthy();
    expect(screen.getByText("Page 50")).toBeTruthy();
    expect(screen.queryByText("Page 0")).toBeNull();
  });

  test("search narrows and reports the denominator", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Page 42" } });
    expect(screen.getByText(/1 of 60/)).toBeTruthy();
  });

  test("a search matching nothing says so instead of going blank", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzzz" } });
    expect(screen.getByText(/No rows match/)).toBeTruthy();
  });
});

describe("trend segmentation in the client", () => {
  const pt = (at, fidelity, grader, known = true) => ({
    at, fidelity, graderModel: grader, fingerprint: `${grader}|x|y|web`, protocolKnown: known, runId: at,
  });

  test("a grader change splits the line rather than joining it", () => {
    // Joining these would render a ~12-point model swap as a regression.
    const segs = segmentsFor(
      [pt("2026-01-01", 70, "claude-opus-4-8"), pt("2026-02-01", 72, "claude-opus-4-8"), pt("2026-03-01", 60, "claude-sonnet-5")],
      "fidelity",
    );
    expect(segs).toHaveLength(2);
    expect(segs[0].points).toHaveLength(2);
  });

  test("the change is marked, not smoothed over", () => {
    const marks = discontinuities([pt("2026-01-01", 70, "claude-opus-4-8"), pt("2026-03-01", 60, "claude-sonnet-5")]);
    expect(marks).toHaveLength(1);
    expect(marks[0].reason).toMatch(/grader changed/);
  });

  test("unknown-protocol points are never joined to a known line", () => {
    const segs = segmentsFor([pt("2025-12-01", 55, null, false), pt("2026-01-01", 70, "claude-sonnet-5")], "fidelity");
    expect(segs).toHaveLength(2);
  });
});
