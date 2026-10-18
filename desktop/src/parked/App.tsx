// Routes. Hash based so the Tauri window serves one index.html. See DECISIONS.md.
import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { applyTheme, useStore } from "@/store";
import { Toaster } from "@/components/Toast";
import { TooltipProvider } from "@/components/Tooltip";
import { Asset } from "@/screens/Asset";
import { Connections } from "@/screens/Connections";
import { CreateStudio } from "@/screens/CreateStudio";
import { Mentions } from "@/screens/Mentions";
import { Name } from "@/screens/Name";
import { NewProject } from "@/screens/NewProject";
import { Part } from "@/screens/Part";
import { Project } from "@/screens/Project";
import { Settings } from "@/screens/Settings";
import { Board } from "@/screens/Board";
import { AppShell } from "@/screens/Shell";
import { SignIn } from "@/screens/SignIn";
import { Welcome } from "@/screens/Welcome";

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => { document.querySelector("main > div")?.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/signin" replace />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/name" element={<Name />} />
      <Route path="/studio" element={<CreateStudio />} />
      <Route path="/settings/:tab?" element={<Settings />} />
      <Route element={<AppShell />}>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/new" element={<NewProject />} />
        <Route path="/connections" element={<Connections />} />
        <Route path="/mentions" element={<Mentions />} />
        <Route path="/p/:project" element={<Project />} />
        <Route path="/p/:project/board" element={<Board />} />
        <Route path="/p/:project/a/:asset" element={<Asset />} />
        <Route path="/p/:project/a/:asset/:part" element={<Part />} />
      </Route>
      <Route path="*" element={<Navigate to="/signin" replace />} />
    </Routes>
  );
}

export function App() {
  const theme = useStore((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <HashRouter>
      <TooltipProvider>
        <div className="flex h-full min-w-[1280px] flex-col bg-canvas text-heading">
          <ScrollReset />
          <AppRoutes />
          <Toaster />
        </div>
      </TooltipProvider>
    </HashRouter>
  );
}
