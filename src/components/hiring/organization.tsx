"use client";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { errorMessage, requestJSON, send, showError } from "@/lib/utils/client";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import { readable } from "@/lib/config/taxonomy";
import type { OrgResponse } from "@/types/hiring";
import { Building2, UserPlus, Users } from "lucide-react";
export function Organization() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["organization"],
    queryFn: () => requestJSON<OrgResponse>("/api/org"),
  });
  const [busy, setBusy] = useState(false);
  const data = query.data;
  if (query.isPending) return <p role="status">Loading organization…</p>;
  if (query.isError)
    return (
      <div className="card stack">
        <p role="alert" className="danger">
          {errorMessage(query.error)}
        </p>
        <button className="button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  if (!data?.org) return <p>No organization.</p>;
  const org = data.org,
    owner = data.role === "owner";
  async function member(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await send(
        "/api/org/members",
        "POST",
        Object.fromEntries(new FormData(form)),
      );
      form.reset();
      await query.refetch();
      toast.success("Member added");
    } catch (error) {
      showError(error);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const fields = new FormData(event.currentTarget),
      file = fields.get("logo");
    try {
      let logoPath: string | undefined;
      if (file instanceof File && file.size > 0) {
        const signed = await send<SignedUpload>(
          "/api/org/logo-upload-url",
          "POST",
          { fileName: file.name, sizeBytes: file.size },
        );
        await uploadFile(
          "org-assets",
          signed,
          file,
          file.type || "application/octet-stream",
        );
        logoPath = signed.path;
      }
      await send("/api/org", "PATCH", {
        name: fields.get("name"),
        website: fields.get("website") || null,
        logoPath,
      });
      await query.refetch();
      router.refresh();
      toast.success("Organization saved");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack-lg">
      <div className="org-hero card">
        <span className="org-logo">
          {org.logoUrl ? (
            <Image
              src={org.logoUrl}
              alt=""
              width={64}
              height={64}
              unoptimized
            />
          ) : (
            <Building2 size={28} aria-hidden="true" />
          )}
        </span>
        <div className="stack-sm">
          <h1>{org.name}</h1>
          <p className="muted">
            {data.members.length}{" "}
            {data.members.length === 1 ? "member" : "members"} · You are{" "}
            {owner ? "an owner" : "a recruiter"}
          </p>
        </div>
      </div>
      <form className="card stack" onSubmit={save}>
        <div className="section-title">
          <Building2 size={20} aria-hidden="true" />
          <h2>Organization details</h2>
        </div>
        <div className="grid-2">
          <label className="field">
            Organization name
            <input
              name="name"
              defaultValue={org.name}
              minLength={2}
              maxLength={80}
              required
              readOnly={!owner}
            />
          </label>
          <label className="field">
            Website
            <input
              name="website"
              type="url"
              defaultValue={org.website ?? ""}
              readOnly={!owner}
              placeholder="https://"
            />
          </label>
        </div>
        {owner && (
          <>
            <label className="field">
              Organization logo
              <input type="file" name="logo" accept=".png,.jpg,.jpeg,.svg" />
              <small>PNG, JPG or SVG up to 1 MB.</small>
            </label>
            <div>
              <button className="button" disabled={busy}>
                Save organization
              </button>
            </div>
          </>
        )}
      </form>
      <section className="card stack">
        <div className="section-title">
          <Users size={20} aria-hidden="true" />
          <h2>Members</h2>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {["Name", "Email", "Role", "Joined", "Action"].map((t) => (
                  <th key={t} scope="col">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.members.map((person) => (
                <tr key={person.userId}>
                  <td>
                    <strong>{person.name}</strong>
                  </td>
                  <td>{person.email}</td>
                  <td>
                    <span
                      className={
                        "badge " + (person.role === "owner" ? "primary" : "")
                      }
                    >
                      {readable(person.role)}
                    </span>
                  </td>
                  <td>{new Date(person.joinedAt).toLocaleDateString()}</td>
                  <td>
                    {owner &&
                      !(
                        person.role === "owner" &&
                        data.members.filter((m) => m.role === "owner")
                          .length === 1
                      ) && (
                        <button
                          className="button ghost danger"
                          onClick={() => {
                            if (
                              confirm(
                                "Remove " +
                                  person.name +
                                  " from the organization?",
                              )
                            )
                              void send(
                                "/api/org/members/" + person.userId,
                                "DELETE",
                              ).then(() => query.refetch(), showError);
                          }}
                        >
                          Remove
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {owner && (
          <form className="stack inset" onSubmit={member}>
            <div className="section-title">
              <UserPlus size={18} aria-hidden="true" />
              <h3>Add member</h3>
            </div>
            <div className="grid-2">
              <label className="field">
                Member email
                <input name="email" type="email" required />
              </label>
              <label className="field">
                Role
                <select name="role">
                  <option value="recruiter">Recruiter</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
            </div>
            <div>
              <button className="button">Add member</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
