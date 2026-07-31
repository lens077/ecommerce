import { proxy, subscribe } from "valtio";
import type { Account } from "@/api/users/types";

export interface UserState {
  account: Account;
}

const savedUser = localStorage.getItem("user");
const initialUser: Account = savedUser
  ? JSON.parse(savedUser)
  : { owner: "", name: "", avatar: "", email: "", id: "", role: "", displayName: "" };

export const userStore = proxy<UserState>({ account: initialUser });

export const setAccount = (account: Partial<Account>) => {
  userStore.account = { ...userStore.account, ...account };
};

subscribe(userStore, () => {
  localStorage.setItem("user", JSON.stringify(userStore.account));
});
