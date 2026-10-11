import { createContext, useContext } from "react";
import { DEFAULT_ROLE_NAMES, type RoleNames } from "../core/users";

export const RoleNamesContext = createContext<RoleNames>(DEFAULT_ROLE_NAMES);
export const useRoleNames = () => useContext(RoleNamesContext);
