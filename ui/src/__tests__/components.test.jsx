import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { FidelityBadge } from "../components/FidelityBadge.jsx";
import { Band } from "../components/Band.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { applyTheme, storedTheme, THEMES } from "../components/ThemeToggle.jsx";
import { segmentsFor, discontinuities } from "../lib/trends.js";
import { nextAction } from "../components/PageActions.jsx";
import { productOf, productOfRun, sortGroups, meanOf, UNGROUPED } from "../lib/group.js";

const assert_equal = (a, b) => expect(a).toBe(b);

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

describe("next action for a page", () => {
  test("no probe set — offer to generate and grade", () => {
    const a = nextAction({ probeSet: { present: false, count: 0 }, tested: false });
    assert_equal(a.key, "generate");
    assert_equal(a.stages.join(","), "probes,test");
  });

  test("probes exist but nothing graded — grade only, never regenerate", () => {
    // Regenerating would pay a second time for a probe set already bought.
    const a = nextAction({ probeSet: { present: true, count: 6 }, tested: false });
    assert_equal(a.key, "test");
    assert_equal(a.stages.join(","), "test");
    expect(a.label).toContain("6");
  });

  test("a probe run that graded nothing does NOT count as tested", () => {
    // This is the failure mode that hid behind a green tick: every probe
    // errored, a summary was still written, and the page looked measured.
    const a = nextAction({ probeSet: { present: true, count: 6 }, tested: false });
    expect(a.key).not.toBe("retest");
  });

  test("already graded — re-running is offered quietly", () => {
    const a = nextAction({ probeSet: { present: true, count: 6 }, tested: true });
    assert_equal(a.key, "retest");
    expect(a.secondary).toBe(true);
    expect(a.force).toBe(true);
  });
});

describe("next action precedence", () => {
  test("an already-measured page is never pushed to regenerate as the PRIMARY action", () => {
    // A page can hold results without the probe set that produced them — every
    // page imported from the correlation study does. Checking "has probes?"
    // before "measured?" told the user to re-pay for a measured page.
    const a = nextAction({ probeSet: { present: false, count: 0 }, tested: true });
    expect(a.secondary).toBe(true);
    assert_equal(a.key, "regenerate");
  });

  test("an unmeasured page with no probes is the primary generate action", () => {
    const a = nextAction({ probeSet: { present: false, count: 0 }, tested: false });
    assert_equal(a.key, "generate");
    expect(a.secondary).toBeUndefined();
  });

  test("re-measuring always forces, so it cannot silently reuse and do nothing", () => {
    for (const page of [
      { probeSet: { present: true, count: 6 }, tested: true },
      { probeSet: { present: false, count: 0 }, tested: true },
    ]) {
      expect(nextAction(page).force).toBe(true);
    }
  });
});

describe("grouping rules", () => {
  test("a page's product is its first URL segment", () => {
    assert_equal(productOf({ url: "https://docs.chain.link/cre/guides/workflow/using-randomness" }), "cre");
    assert_equal(productOf({ url: "https://docs.chain.link/data-feeds/price-feeds" }), "data-feeds");
  });

  test("the markdown endpoint is the same product, not a second one", () => {
    // /cre.md and /cre are one product. Splitting them put three real pages in
    // groups of one.
    assert_equal(productOf({ url: "https://docs.chain.link/cre.md" }), "cre");
    assert_equal(productOf({ url: "https://docs.chain.link/cre.md" }), productOf({ url: "https://docs.chain.link/cre" }));
  });

  test("a page with no audit yet is labelled, never dropped", () => {
    assert_equal(productOf({ url: null }), UNGROUPED);
    assert_equal(productOf({ url: "not a url" }), UNGROUPED);
  });

  test("a single-page run groups with its product's sweep", () => {
    // The whole point of sharing the taxonomy: these two must land together.
    const sweep = productOfRun({ target: { type: "product", name: "ace" } });
    const single = productOfRun({ target: { type: "page", name: "https://docs.chain.link/ace/getting-started" } });
    assert_equal(sweep, single);
  });

  test("a watchlist stays its own bucket — it can span products", () => {
    assert_equal(productOfRun({ target: { type: "watchlist", name: "correlation-study" } }), "correlation-study (watchlist)");
  });

  test("biggest group first, unplaceable rows last", () => {
    const groups = sortGroups([
      { key: UNGROUPED, rows: [1, 2, 3, 4, 5] },
      { key: "ace", rows: [1] },
      { key: "cre", rows: [1, 2, 3] },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["cre", "ace", UNGROUPED]);
  });

  test("an ordinal grouping keeps its own order, not the biggest bucket first", () => {
    // Sorting bands by population puts "Good" above "Strong" and the column
    // stops reading as a quality scale.
    const groups = sortGroups(
      [
        { key: "Good", rows: [1, 2, 3, 4, 5] },
        { key: "Poor", rows: [1] },
        { key: "Strong", rows: [1, 2] },
      ],
      ["Exemplary", "Strong", "Good", "Developing", "Poor"],
    );
    expect(groups.map((g) => g.key)).toEqual(["Strong", "Good", "Poor"]);
  });

  test("a key missing from an explicit order sorts last, not first", () => {
    const groups = sortGroups(
      [{ key: "surprise", rows: [1] }, { key: "Poor", rows: [1] }],
      ["Strong", "Poor"],
    );
    expect(groups.map((g) => g.key)).toEqual(["Poor", "surprise"]);
  });

  test("a mean ignores rows that carry no value rather than counting them as zero", () => {
    assert_equal(meanOf([{ s: 10 }, { s: null }, { s: 20 }], (r) => r.s), 15);
    assert_equal(meanOf([{ s: null }], (r) => r.s), null);
  });
});

const groupedRows = [
  ...Array.from({ length: 5 }, (_, i) => ({ key: `c${i}`, title: `CRE ${i}`, product: "cre", score: i })),
  ...Array.from({ length: 2 }, (_, i) => ({ key: `a${i}`, title: `ACE ${i}`, product: "ace", score: i })),
];
const GROUPS = [
  { key: "product", label: "Product", of: (r) => r.product },
  { key: "score", label: "Score band", of: (r) => (r.score > 2 ? "high" : "low") },
];

function renderGrouped(initial = "/") {
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
              <DataTable
                rows={groupedRows}
                columns={columns}
                searchKeys={["title"]}
                groups={GROUPS}
                groupSummary={(rs) => `${rs.length} pages`}
              />
              <Probe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, getSearch: () => search };
}

describe("DataTable grouping", () => {
  test("groups by the first option with no URL state, biggest first", () => {
    renderGrouped();
    const heads = screen.getAllByRole("button", { expanded: true });
    expect(heads[0].textContent).toMatch(/cre/);
    expect(heads[1].textContent).toMatch(/ace/);
    expect(screen.getByText("CRE 0")).toBeTruthy();
    expect(screen.getByText("ACE 0")).toBeTruthy();
  });

  test("a group header carries its own count and summary", () => {
    renderGrouped();
    expect(screen.getByText("5 pages")).toBeTruthy();
    expect(screen.getByText("2 pages")).toBeTruthy();
  });

  test("collapsing hides a group's rows but keeps the header", () => {
    renderGrouped();
    const creHead = screen.getAllByRole("button", { expanded: true })[0];
    fireEvent.click(creHead);
    expect(screen.queryByText("CRE 0")).toBeNull();
    expect(screen.getByText("ACE 0")).toBeTruthy();
  });

  test("a chip focuses one group and round-trips through the URL", () => {
    const { getSearch } = renderGrouped();
    // Scoped to the chip row: the group header carries the same label, and an
    // ambiguous query here would pass by accident on whichever came first.
    const chips = screen.getByRole("group", { name: /filter by product/i });
    fireEvent.click(within(chips).getByRole("button", { name: /^ace/i }));
    assert_equal(getSearch().get("g"), "ace");
    expect(screen.getByText("ACE 0")).toBeTruthy();
    expect(screen.queryByText("CRE 0")).toBeNull();
  });

  test("a pasted focused URL reproduces the view", () => {
    renderGrouped("/?group=product&g=ace");
    expect(screen.getByText("ACE 0")).toBeTruthy();
    expect(screen.queryByText("CRE 0")).toBeNull();
    // Focused mode is flat, so there is no group header to expand.
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);
  });

  test("switching grouping clears the focused group", () => {
    // Otherwise `g=ace` survives into a grouping that has no `ace` bucket and
    // the table goes silently empty.
    const { getSearch } = renderGrouped("/?group=product&g=ace");
    fireEvent.change(screen.getByLabelText("Group by"), { target: { value: "score" } });
    assert_equal(getSearch().get("group"), "score");
    assert_equal(getSearch().get("g"), null);
  });

  test("grouping off falls back to the flat table", () => {
    renderGrouped("/?group=none");
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);
    expect(screen.getByText("CRE 0")).toBeTruthy();
    expect(screen.getByText("ACE 0")).toBeTruthy();
  });

  test("search narrows the chip counts so a chip never promises excluded rows", () => {
    renderGrouped();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "CRE" } });
    // ace is gone entirely; cre keeps its five.
    expect(screen.queryByRole("button", { name: /^ace/i })).toBeNull();
    expect(screen.getByText(/1 group/)).toBeTruthy();
    const chips = screen.queryByRole("group", { name: /filter by product/i });
    // One group left means no chip row at all — nothing to choose between.
    assert_equal(chips, null);
  });
});

describe("DataTable default sort", () => {
  test("a view's natural order applies with no URL state", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <DataTable rows={rows} columns={columns} defaultSort={{ key: "score", dir: "desc" }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Page 59")).toBeTruthy();
    expect(screen.queryByText("Page 0")).toBeNull();
  });

  test("the URL still wins over the default", () => {
    render(
      <MemoryRouter initialEntries={["/?sort=score&dir=asc"]}>
        <DataTable rows={rows} columns={columns} defaultSort={{ key: "score", dir: "desc" }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Page 0")).toBeTruthy();
  });
});
