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
      assignedStoreIds?: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessAllStores?: boolean;
    assignedStoreIds?: string[];
  }
}
