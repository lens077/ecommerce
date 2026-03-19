export interface Account {
  id: string;
  displayName: string;
  createdTime: string;
  organization: string;
  username: string;
  type: string;
  name: string;
  avatar: string;
  email: string;
  phone: string;
  affiliation: string;
  tag: string;
  language: string;
  score: number;
  isAdmin: boolean;
  accessToken: string;
}
export interface Role {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  roles: string[];
  domains: string[];
  isEnabled: boolean;
}

export interface Permission {
  owner: string;
  name: string;
  createdTime: string;
  displayName: string;
  description: string;
  users: string[] | null;
  groups: string[];
  roles: string[];
  domains: string[];
  model: string;
  adapter: string;
  resourceType: string;
  resources: string[];
  actions: string[];
  effect: string;
  isEnabled: boolean;
  submitter: string;
  approver: string;
  approveTime: string;
  state: string;
}
