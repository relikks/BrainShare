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
  FileText,
  Folder,
  FolderPlus,
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
  const fileInput = useRef<HTMLInputElement>(null);

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

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    toast.message(`Uploading ${files.length} file(s)…`);
    for (const f of Array.from(files)) {
      try {
        await uploadFile(id, dir, f);
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    toast.success("Uploaded — embedding in background");
    load();
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
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" /> Upload
          </Button>

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
                <Card key={f.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.modality} · {(f.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    {f.status === "pending" && <Badge variant="secondary">embedding…</Badge>}
                    {f.status === "failed" && <Badge variant="destructive">failed</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => remove(f)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
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
