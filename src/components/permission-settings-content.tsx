"use client";

import { useCallback, useState } from "react";
import { StaffAccountsList } from "@/components/staff-accounts-list";
import { PermissionAccountForm } from "@/components/permission-account-form";

type Store = { id: string; name: string };

export function PermissionSettingsContent({ stores }: { stores: Store[] }) {
  const [listKey, setListKey] = useState(0);
  const refresh = useCallback(() => setListKey((k) => k + 1), []);

  return (
    <div className="space-y-10 max-w-3xl">
      <StaffAccountsList stores={stores} refreshKey={listKey} />
      <div>
        <h2 className="text-lg font-semibold mb-3">新規アカウント作成</h2>
        <PermissionAccountForm stores={stores} onCreated={refresh} />
      </div>
    </div>
  );
}
