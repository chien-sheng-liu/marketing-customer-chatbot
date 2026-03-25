import { useState, useCallback } from 'react';
import { fetchMemberProfile as apiFetchMember, MemberProfile } from '../services/apiClient';

type CustomerMode = 'unknown' | 'member' | 'guest';

interface UseMemberReturn {
  customerMode: CustomerMode;
  customerId: string | null;
  customerName: string;
  isVerified: boolean;
  memberProfile: MemberProfile | null;
  memberIdInput: string;
  memberError: string | null;
  setCustomerMode: (mode: CustomerMode) => void;
  setMemberIdInput: (v: string) => void;
  setMemberError: (v: string | null) => void;
  verifyMember: (id: string) => Promise<MemberProfile>;
  reset: () => void;
}

export function useMember(initialMode: CustomerMode = 'unknown'): UseMemberReturn {
  const [customerMode, setCustomerMode] = useState<CustomerMode>(initialMode);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [memberIdInput, setMemberIdInput] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);

  const verifyMember = useCallback(async (id: string): Promise<MemberProfile> => {
    const profile = await apiFetchMember(id);
    setMemberProfile(profile);
    setCustomerId(profile.memberId);
    setCustomerName(profile.name);
    setIsVerified(true);
    setCustomerMode('member');
    setMemberError(null);
    return profile;
  }, []);

  const reset = useCallback(() => {
    setCustomerMode(initialMode);
    setCustomerId(null);
    setCustomerName('');
    setIsVerified(false);
    setMemberProfile(null);
    setMemberIdInput('');
    setMemberError(null);
  }, [initialMode]);

  return {
    customerMode,
    customerId,
    customerName,
    isVerified,
    memberProfile,
    memberIdInput,
    memberError,
    setCustomerMode,
    setMemberIdInput,
    setMemberError,
    verifyMember,
    reset,
  };
}
