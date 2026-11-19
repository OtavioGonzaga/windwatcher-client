import { Route, Routes } from "react-router";
import { HomePage, ServersPage } from "./pages/HomePage";
import { PreferencesPage } from "./pages/PreferencesPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AppShell } from "./AppShell";
import { AddServerPage } from "../features/server-discovery/AddServerPage";
import { AuthenticationPage } from "../features/authentication/AuthenticationPage";
import { ConversationDetailPage, InboxPage } from "../features/conversations/ConversationPages";
import { NewDirectPage } from "../features/conversations/NewDirectPage";
import { GroupCreationPage } from "../features/conversations/GroupCreationPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="/conversations" element={<InboxPage />}>
          <Route index element={null} />
          <Route path=":conversationId" element={<ConversationDetailPage />} />
        </Route>
        <Route path="/conversations/new" element={<NewDirectPage />} />
        <Route path="/conversations/groups/new" element={<GroupCreationPage />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/connect" element={<AddServerPage />} />
        <Route path="/servers/:profileId/login" element={<AuthenticationPage />} />
        <Route path="/servers/:profileId/register" element={<AuthenticationPage registration />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
