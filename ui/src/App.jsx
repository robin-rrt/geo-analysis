import { NavLink, Route, Routes } from "react-router-dom";
import { ThemeToggle } from "./components/ThemeToggle.jsx";
import { client } from "./api/client.js";
import Overview from "./routes/Overview.jsx";
import Pages from "./routes/Pages.jsx";
import PageDetail from "./routes/PageDetail.jsx";
import Runs from "./routes/Runs.jsx";
import RunDetail from "./routes/RunDetail.jsx";
import NewRun from "./routes/NewRun.jsx";

export default function App() {
  return (
    <>
      <nav className="top">
        <strong style={{ fontSize: 14 }}>GEO</strong>
        <NavLink to="/">Overview</NavLink>
        <NavLink to="/pages">Pages</NavLink>
        <NavLink to="/runs">Runs</NavLink>
        {/* The published export is read-only and has no API, so it must not
            advertise an action it cannot perform. */}
        {client.readOnly ? null : <NavLink to="/new">New run</NavLink>}
        <div className="spacer" />
        {client.readOnly ? <span className="badge">read-only</span> : null}
        <ThemeToggle />
      </nav>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/pages" element={<Pages />} />
        <Route path="/pages/:key" element={<PageDetail />} />
        <Route path="/runs" element={<Runs />} />
        <Route path="/runs/:runId" element={<RunDetail />} />
        {client.readOnly ? null : <Route path="/new" element={<NewRun />} />}
        <Route path="*" element={<div className="wrap"><h1>Not found</h1></div>} />
      </Routes>
    </>
  );
}
