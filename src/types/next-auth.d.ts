import "next-auth";
import type { UserRole } from "@/lib/roles";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    storeId?: string | null;
    storeName?: string | null;
    accessAllStores?: boolean;
    editAllStores?: boolean;
    assignedStoreIds?: string[];
    editableStoreIds?: string[];
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      storeId: string | null;
      storeName: string | null;
      accessAllStores?: boolean;
      editAllStores?: boolean;
      assignedStoreIds?: string[];
      editableStoreIds?: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    name?: string | null;
    email?: string | null;
    role?: UserRole;
    storeId?: string | null;
    storeName?: string | null;
    accessAllStores?: boolean;
    editAllStores?: boolean;
    assignedStoreIds?: string[];
    editableStoreIds?: string[];
    /**
     * パスワードの指紋。再発行するとこの値が変わるので、
     * 別の端末に残っているログインを無効にできる。
     */
    pwf?: string;
  }
}
