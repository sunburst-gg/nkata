// Routes. Hash based so the Tauri window serves one index.html. See DECISIONS.md.
import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { applyTheme, useStore } from "@/store";
import { Toaster } from "@/components/Toast";
import { TooltipProvider } from "@/components/Tooltip";
import { Asset } from "@/screens/Asset";
import { CreateStudio, Join, JoinStart, SignIn, SignUp } from "@/screens/Auth";
import { Changes } from "@/screens/Changes";
import { Create } from "@/screens/Create";
import { Home } from "@/screens/Home";
import { Part } from "@/screens/Part";
import { People } from "@/screens/People";
import { Profile } from "@/screens/Profile";
import { Project } from "@/screens/Project";
import { ProjectLayout } from "@/screens/ProjectLayout";
import { Settings } from "@/screens/Settings";
import { ServerCreate, ServerSignIn } from "@/screens/ServerAuth";
import { States } from "@/screens/States";
import { useMock } from "@/data/boot";
import { Templates } from "@/screens/Templates";

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => { document.querySelector("main")?.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/signin" element={useMock() ? <SignIn /> : <ServerSignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/new-studio" element={<CreateStudio />} />
      <Route path="/join" element={useMock() ? <Join /> : <ServerSignIn />} />
      <Route path="/join/start" element={<JoinStart />} />
      <Route path="/home" element={<Home />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/new/:step" element={useMock() ? <Create /> : <ServerCreate />} />
      <Route path="/p/:project" element={<ProjectLayout />}>
        <Route index element={<Project />} />
        <Route path="changes" element={<Changes />} />
        <Route path="people" element={<People />} />
        <Route path="templates" element={<Templates />} />
        <Route path="settings" element={<Settings />} />
        <Route path="a/:asset" element={<Asset />} />
        <Route path="a/:asset/:part" element={<Part />} />
      </Route>
      <Route path="/states" element={<States />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
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
