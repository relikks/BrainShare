"use client";

import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Input,
  cn,
  toast,
  useHideOnScroll,
} from "@drekis/shader";
import {
  Cpu,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  Image as ImageIcon,
  Music,
  Trash2,
  Upload,
  UserPlus,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FilePreviewDialog } from "@/components/FileViewer";
import { ModulesDialog } from "@/components/ModulesDialog";
import { addMember, browse, createDirectory, deleteFile, uploadFile } from "@/lib/api";
import { getUuid } from "@/lib/config";
import type { Browse, FileItem, Modality, Role } from "@/lib/types";

const ICON: Record<Modality, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
};

function Browser() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const dir = sp.get("dir");
  const hidden = useHideOnScroll(true);
  const [data, setData] = useState<Browse | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [shareUser, setShareUser] = useState("");
  const [shareRole, setShareRole] = useState<Role>("viewer");
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!getUuid()) return;
    browse(id, dir)
      .then(setData)
      .catch((e) => toast.error(String(e.message)));
  };
  useEffect(load, [id, dir]);

  async function makeFolder() {
    if (!newFolder.trim()) return;
    try {
      await createDirectory(id, dir, newFolder.trim());
      setNewFolder("");
      toast.success("Folder created");
      load();
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  // Skip OS litter inside folders/zips — it would only pollute the index.
  const JUNK = /(^|\/)(\.DS_Store|__MACOSX|Thumbs\.db|desktop\.ini)(\/|$)/;
  const ZIP_EXPAND_LIMIT = 500 * 1024 * 1024; // browser-side unzip cap

  /** Create every folder a batch needs (depth order), rooted at the current dir.
   *  Returns dirPath → directory_id ("" = here). */
  async function ensureDirs(paths: Set<string>): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>([["", dir]]);
    const sorted = [...paths].filter(Boolean).sort((a, b) => a.split("/").length - b.split("/").length);
    for (const p of sorted) {
      if (map.has(p)) continue;
      const parent = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      const d = await createDirectory(id, map.get(parent) ?? dir, p.split("/").pop()!);
      map.set(p, d.id);
    }
    return map;
  }

  /** Batch upload: recreate the tree, then push files a few at a time. Each upload
   *  kicks the per-type embedding pipeline server-side, so the whole batch ends up
   *  vectorized per its file types. */
  async function uploadEntries(entries: { path: string; file: File }[]) {
    const clean = entries.filter((e) => !JUNK.test(e.path));
    if (!clean.length) return;
    const dirPaths = new Set(
      clean.map((e) => (e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "")),
    );
    let dirMap: Map<string, string | null>;
    try {
      setProgress("Creating folders…");
      dirMap = await ensureDirs(dirPaths);
    } catch (e) {
      setProgress(null);
      toast.error(`Folders: ${(e as Error).message}`);
      return;
    }
    let done = 0;
    let failed = 0;
    const queue = [...clean];
    const worker = async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        const parent = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
        try {
          await uploadFile(id, dirMap.get(parent) ?? dir, e.file);
        } catch {
          failed++;
        }
        done++;
        setProgress(`Uploading ${done}/${clean.length}…`);
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    setProgress(null);
    if (failed) toast.error(`${failed} of ${clean.length} uploads failed`);
    else toast.success(`Uploaded ${clean.length} file(s) — embedding in background`);
    load();
  }

  /** Client-side zip expansion (fflate) → path'd entries, guarded by a size cap. */
  async function expandZip(f: File): Promise<{ path: string; file: File }[]> {
    const { unzip } = await import("fflate");
    const buf = new Uint8Array(await f.arrayBuffer());
    const contents = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
      unzip(buf, (err, data) => (err ? reject(err) : resolve(data))),
    );
    const out: { path: string; file: File }[] = [];
    let total = 0;
    for (const [path, data] of Object.entries(contents)) {
      if (path.endsWith("/") || JUNK.test(path)) continue;
      total += data.length;
      if (total > ZIP_EXPAND_LIMIT)
        throw new Error("too large to expand in the browser (>500MB) — upload as a folder instead");
      out.push({ path, file: new File([data as BlobPart], path.split("/").pop()!) });
    }
    return out;
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const arr = Array.from(files);
    const entries: { path: string; file: File }[] = arr
      .filter((f) => !f.name.toLowerCase().endsWith(".zip"))
      .map((f) => ({ path: f.name, file: f }));
    for (const z of arr.filter((f) => f.name.toLowerCase().endsWith(".zip"))) {
      try {
        setProgress(`Expanding ${z.name}…`);
        entries.push(...(await expandZip(z)));
      } catch (e) {
        toast.error(`${z.name}: ${(e as Error).message}`);
      }
    }
    setProgress(null);
    await uploadEntries(entries);
  }

  async function onFolderPicked(files: FileList | null) {
    if (!files?.length) return;
    const entries = Array.from(files).map((f) => ({
      path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      file: f,
    }));
    await uploadEntries(entries);
  }

  async function remove(f: FileItem) {
    try {
      await deleteFile(f.id);
      toast.success(`Deleted ${f.name}`);
      load();
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  async function share() {
    if (!shareUser.trim()) return;
    try {
      await addMember(id, shareUser.trim(), shareRole);
      toast.success(`Shared with ${shareUser} (${shareRole})`);
      setShareUser("");
    } catch (e) {
      toast.error(String((e as Error).message));
    }
  }

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex w-full flex-col">
      {/* layer-dependent breadcrumb bar — sticky under the top bar, shifts up when it hides */}
      <div
        className={cn(
          "sticky z-20 flex h-11 items-center border-b border-border bg-background px-5 transition-[top] duration-300",
          hidden ? "top-0" : "top-14",
        )}
      >
        <Breadcrumb>
          <BreadcrumbList>
            {data.breadcrumb.map((c, i) => {
              const last = i === data.breadcrumb.length - 1;
              return (
                <span key={c.id ?? "root"} className="flex items-center gap-1.5">
                  <BreadcrumbItem>
                    {last ? (
                      <BreadcrumbPage>{c.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={c.id ? `/c/${id}?dir=${c.id}` : `/c/${id}`}>
                        {c.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!last && <BreadcrumbSeparator />}
                </span>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="space-y-5 p-5">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-9 w-44"
            placeholder="New folder…"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && makeFolder()}
          />
          <Button variant="outline" size="sm" onClick={makeFolder}>
            <FolderPlus className="size-4" /> Folder
          </Button>

          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button size="sm" onClick={() => fileInput.current?.click()} disabled={!!progress}>
            <Upload className="size-4" /> Upload
          </Button>

          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            {...({ webkitdirectory: "" } as Record<string, string>)}
            onChange={(e) => onFolderPicked(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => folderInput.current?.click()}
            disabled={!!progress}
          >
            <FolderUp className="size-4" /> Upload folder
          </Button>

          {progress && <span className="text-xs text-muted-foreground">{progress}</span>}

          <Dialog>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <UserPlus className="size-4" /> Share
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Share “{data.collection.name}”</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <Input
                  placeholder="username"
                  value={shareUser}
                  onChange={(e) => setShareUser(e.target.value)}
                />
                <div className="flex gap-2">
                  {(["viewer", "editor"] as Role[]).map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      variant={shareRole === r ? "primary" : "outline"}
                      onClick={() => setShareRole(r)}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
                <Button onClick={share}>Share</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" onClick={() => setModulesOpen(true)}>
            <Cpu className="size-4" /> Modules
          </Button>
        </div>

        {/* folders */}
        {data.directories.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {data.directories.map((d) => (
              <Link key={d.id} href={`/c/${id}?dir=${d.id}`}>
                <Card className="transition-colors hover:border-primary">
                  <CardContent className="flex items-center gap-2 p-3">
                    <Folder className="size-5 text-primary" />
                    <span className="truncate text-sm font-medium">{d.name}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* files */}
        {data.files.length === 0 && data.directories.length === 0 ? (
          <EmptyState
            title="Empty folder"
            description="Upload files or create a subfolder to get started."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.files.map((f) => {
              const Icon = ICON[f.modality];
              return (
                <Card key={f.id} className="cursor-pointer transition-colors hover:border-primary">
                  <CardContent
                    className="flex items-center gap-3 p-3"
                    onClick={() => setPreview(f)}
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.modality} · {(f.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    {f.status === "pending" && <Badge variant="secondary">embedding…</Badge>}
                    {f.status === "failed" && <Badge variant="destructive">failed</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(f);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
      <ModulesDialog
        collectionId={id}
        canEdit={data.collection.role !== "viewer"}
        open={modulesOpen}
        onClose={() => setModulesOpen(false)}
      />
    </div>
  );
}

export default function CollectionPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <Browser />
    </Suspense>
  );
}
