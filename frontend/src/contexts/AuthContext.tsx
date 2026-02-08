import React, { createContext, useContext } from "react";

// Minimal auth context - no authentication
interface AuthContextType {
  user: null;
  session: null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: null }>;
  signUp: (email: string, password: string) => Promise<{ error: null }>;
  signInWithGoogle: () => Promise<{ error: null }>;
  signInWithGithub: () => Promise<{ error: null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // No-op implementations - auth is disabled
  const value: AuthContextType = {
    user: null,
    session: null,
    loading: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signInWithGoogle: async () => ({ error: null }),
    signInWithGithub: async () => ({ error: null }),
    signOut: async () => {},
    resetPassword: async () => ({ error: null }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
