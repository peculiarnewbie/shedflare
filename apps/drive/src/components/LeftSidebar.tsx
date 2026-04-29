import { For, Show } from "solid-js";
import { useDrive } from "../context";
import UploadPanel from "./UploadPanel";
import SearchPanel from "./SearchPanel";
import TagStrip from "./TagStrip";

export default function LeftSidebar() {
  const ctx = useDrive();

  return (
    <aside class="left-sidebar" classList={{ collapsed: !ctx.leftSidebarOpen() }}>
      <div class="left-sidebar-inner">
        <UploadPanel />
        <SearchPanel />
        <TagStrip />
      </div>
    </aside>
  );
}
