import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: "admin" | "employee" | "cast";
      storeId: string | null;
      storeName: string | null;
    };
  }
}
