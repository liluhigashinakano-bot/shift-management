import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: "admin" | "employee" | "viewer" | "cast";
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
    role?: string;
    storeId?: string | null;
    storeName?: string | null;
    accessAllStores?: boolean;
    editAllStores?: boolean;
    assignedStoreIds?: string[];
    editableStoreIds?: string[];
  }
}
