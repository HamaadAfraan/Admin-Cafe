import { useState, useEffect } from "react";
import { 
  Users, 
  Search, 
  Phone, 
  Mail, 
  Calendar, 
  Gamepad2, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  RefreshCw, 
  Eye, 
  Receipt, 
  IndianRupee, 
  ArrowLeft,
  CalendarDays,
  History,
  Tag,
  User,
  Gem,
  Trophy,
  UserX,
  SlidersHorizontal,
  PlusCircle,
  AlertTriangle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";

export interface UserProfile {
  key: string;
  name: string;
  phone: string;
  email: string;
  avatarUrl?: string;
  totalBookings: number;
  approvedCount: number;
  totalSpent: number;
  gamerPoints: number;
  redeemableDiamonds: number;
  loyaltyTier: string;
  lastBookingDate: string;
  bookings: any[];
  recharges: any[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "profiles" | "recharges";
}

function getUserLeague(tier: string, points: number) {
  const t = (tier || "").toUpperCase();
  if (t === "DIAMOND" || points >= 2500) {
    return { name: "DIAMOND VIP", rank: 4, color: "bg-cyan-950 text-cyan-300 border-cyan-400/85 shadow-[0_0_10px_rgba(6,182,212,0.4)]" };
  }
  if (t === "GOLD" || points >= 1000) {
    return { name: "GOLD", rank: 3, color: "bg-amber-950 text-amber-300 border-amber-400/85 shadow-[0_0_10px_rgba(245,158,11,0.4)]" };
  }
  if (t === "SILVER" || points >= 500) {
    return { name: "SILVER", rank: 2, color: "bg-slate-800 text-slate-200 border-slate-400/85" };
  }
  return { name: t || "BRONZE", rank: 1, color: "bg-amber-950/60 text-amber-500 border-amber-800/60" };
}

const formatDateToReadable = (d: Date = new Date()): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/(\d+):(\d+)\s*(AM|PM)?/);
  if (!match) return 0;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];

  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function isBookingUpcoming(booking: any): boolean {
  try {
    const rawDate = booking.bookingDate || booking.booking_date || booking.date || "";
    if (!rawDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bDate = new Date(rawDate);
    if (isNaN(bDate.getTime())) return false;
    bDate.setHours(0, 0, 0, 0);

    if (bDate.getTime() > today.getTime()) return true;

    if (bDate.getTime() === today.getTime()) {
      const slotStr = booking.slot_time || booking.slot || "";
      const parts = slotStr.split("-");
      const endTimeStr = (parts.length > 1 ? parts[1] : parts[0]).trim();
      const endMins = parseTimeToMinutes(endTimeStr);

      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();

      return endMins > currentMins;
    }

    return false;
  } catch {
    return false;
  }
}

export function UserProfilesModal({ open, onOpenChange, initialTab = "profiles" }: Props) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allRecharges, setAllRecharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"profiles" | "recharges">(initialTab);
  const [sortBy, setSortBy] = useState<string>("points-high");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [selectedRecharge, setSelectedRecharge] = useState<any | null>(null);

  // Confirmation dialog state for granting diamonds to selected user
  const [confirmPack, setConfirmPack] = useState<{ amount: number; diamonds: number } | null>(null);

  const fetchUsersAndData = async () => {
    setLoading(true);
    try {
      const { data: savedProfiles, error: pError } = await supabase
        .from("profiles")
        .select("*");

      if (pError) console.error("Error fetching profiles:", pError);

      const { data: bookingsData, error: bError } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });

      if (bError) console.error("Error fetching bookings:", bError);

      const { data: rechargesData, error: rError } = await supabase
        .from("diamond_recharges")
        .select("*")
        .order("created_at", { ascending: false });

      if (rError) console.error("Error fetching recharges:", rError);

      setAllRecharges(rechargesData || []);

      const userMap: Record<string, UserProfile> = {};

      const resolveUserKey = (id: string, phone: string, email: string) => {
        const cleanId = String(id || "").trim();
        const cleanPhone = String(phone || "").trim();
        const cleanEmail = String(email || "").trim().toLowerCase();

        if (cleanId && userMap[cleanId]) return cleanId;
        if (cleanEmail && cleanEmail !== "") {
          const foundByEmail = Object.keys(userMap).find(
            k => userMap[k].email.toLowerCase() === cleanEmail
          );
          if (foundByEmail) return foundByEmail;
        }
        if (cleanPhone && cleanPhone.length >= 7 && cleanPhone !== "0000000000") {
          const foundByPhone = Object.keys(userMap).find(
            k => userMap[k].phone === cleanPhone
          );
          if (foundByPhone) return foundByPhone;
        }
        return cleanId || (cleanPhone.length >= 7 ? cleanPhone : cleanEmail);
      };

      (savedProfiles || []).forEach((p: any) => {
        const id = String(p.id || "").trim();
        const phone = String(p.phone || "").trim();
        const email = String(p.email || "").trim();
        const name = String(p.name || "Customer").trim();
        const avatarUrl = p.avatar_url || "";
        const gamerPoints = Number(p.gamer_points ?? p.diamond_points ?? p.points ?? 0);
        const redeemableDiamonds = Number(p.redeemable_diamonds ?? 0);
        const loyaltyTier = String(p.loyalty_tier || "BRONZE");
        
        const userKey = resolveUserKey(id, phone, email);

        if (!userMap[userKey]) {
          userMap[userKey] = {
            key: userKey,
            name: name,
            phone: phone,
            email: email,
            avatarUrl: avatarUrl,
            totalBookings: 0,
            approvedCount: 0,
            totalSpent: 0,
            gamerPoints: gamerPoints,
            redeemableDiamonds: redeemableDiamonds,
            loyaltyTier: loyaltyTier,
            lastBookingDate: p.updated_at || "",
            bookings: [],
            recharges: []
          };
        } else {
          if (name && name !== "Customer") userMap[userKey].name = name;
          if (phone) userMap[userKey].phone = phone;
          if (email) userMap[userKey].email = email;
          if (avatarUrl) userMap[userKey].avatarUrl = avatarUrl;
          if (gamerPoints > userMap[userKey].gamerPoints) userMap[userKey].gamerPoints = gamerPoints;
          if (redeemableDiamonds > userMap[userKey].redeemableDiamonds) userMap[userKey].redeemableDiamonds = redeemableDiamonds;
          if (loyaltyTier && loyaltyTier !== "BRONZE") userMap[userKey].loyaltyTier = loyaltyTier;
        }
      });

      (bookingsData || []).forEach((b: any) => {
        const phone = String(b.phone || "").trim();
        const email = String(b.email || "").trim();
        const name = String(b.customer_name || b.name || b.customer || "Walk-In Customer").trim();
        const profileId = String(b.profile_id || b.user_id || "").trim();
        const avatarUrl = b.avatar_url || "";

        const userKey = resolveUserKey(profileId, phone, email);

        if (!userMap[userKey]) {
          userMap[userKey] = {
            key: userKey,
            name: name,
            phone: phone,
            email: email,
            avatarUrl: avatarUrl,
            totalBookings: 0,
            approvedCount: 0,
            totalSpent: 0,
            gamerPoints: 0,
            redeemableDiamonds: 0,
            loyaltyTier: "BRONZE",
            lastBookingDate: b.bookingDate || b.booking_date || b.created_at || "",
            bookings: [],
            recharges: []
          };
        }

        const userObj = userMap[userKey];
        userObj.bookings.push(b);
        userObj.totalBookings += 1;

        const st = String(b.status || "").toUpperCase();
        if (st === "APPROVED") {
          const bookingAmount = Number(b.price || b.amount || 0);
          userObj.approvedCount += 1;
          userObj.totalSpent += bookingAmount;
        }

        if (email && !userObj.email) userObj.email = email;
        if (phone && phone.length >= 7 && phone !== "0000000000" && !userObj.phone) userObj.phone = phone;
        if (avatarUrl && !userObj.avatarUrl) userObj.avatarUrl = avatarUrl;
        if (name && name !== "Walk-In Customer" && (userObj.name === "Walk-In Customer" || !userObj.name)) {
          userObj.name = name;
        }
      });

      (rechargesData || []).forEach((r: any) => {
        const phone = String(r.phone || "").trim();
        const email = String(r.email || "").trim();
        const name = String(r.customer_name || r.name || "Customer").trim();
        const profileId = String(r.user_id || "").trim();

        const userKey = resolveUserKey(profileId, phone, email);

        if (!userMap[userKey]) {
          userMap[userKey] = {
            key: userKey,
            name: name,
            phone: phone,
            email: email,
            totalBookings: 0,
            approvedCount: 0,
            totalSpent: 0,
            gamerPoints: 0,
            redeemableDiamonds: 0,
            loyaltyTier: "BRONZE",
            lastBookingDate: r.created_at || "",
            bookings: [],
            recharges: []
          };
        }

        const userObj = userMap[userKey];
        userObj.recharges.push(r);

        const st = String(r.status || "").toUpperCase();
        if (st === "APPROVED") {
          userObj.totalSpent += Number(r.amount || 0);
        }
      });

      const userList = Object.values(userMap).filter(
        (u) => u.phone && u.phone !== "0000000000" && u.phone.length >= 7
      );

      setUsers(userList);

      if (selectedUser) {
        const updatedSelected = userList.find(u => u.key === selectedUser.key);
        if (updatedSelected) setSelectedUser(updatedSelected);
      }
    } catch (e) {
      console.error("Failed fetching user profiles:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      fetchUsersAndData();

      const channel = supabase
        .channel("profiles_realtime_sync_v25")
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
          fetchUsersAndData();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
          fetchUsersAndData();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "diamond_recharges" }, () => {
          fetchUsersAndData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, initialTab]);

  const handleApproveBooking = async (booking: any) => {
    try {
      await supabase
        .from("bookings")
        .update({ status: "APPROVED" })
        .eq("id", booking.id);

      const phone = String(booking.phone || "").trim();
      const amount = Number(booking.price || booking.amount || 0);

      if (phone && phone.length >= 7 && phone !== "undefined" && phone !== "null") {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("phone", phone)
          .maybeSingle();

        const currentPts = existingProfile?.gamer_points || 0;
        const updatedPts = currentPts + Math.floor(amount);

        let newTier = "BRONZE";
        if (updatedPts >= 5000) newTier = "LEGEND";
        else if (updatedPts >= 2500) newTier = "DIAMOND";
        else if (updatedPts >= 1000) newTier = "GOLD";
        else if (updatedPts >= 500) newTier = "SILVER";

        if (existingProfile && existingProfile.id) {
          await supabase
            .from("profiles")
            .update({
              gamer_points: updatedPts,
              loyalty_tier: newTier,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingProfile.id);
        } else {
          await supabase
            .from("profiles")
            .insert({
              phone: phone,
              name: booking.customer_name || booking.name || "Customer",
              gamer_points: updatedPts,
              loyalty_tier: newTier
            });
        }
      }

      fetchUsersAndData();
      if (selectedBooking && selectedBooking.id === booking.id) {
        setSelectedBooking((prev: any) => ({ ...prev, status: "APPROVED" }));
      }
    } catch (e) {
      console.error("Failed to approve booking:", e);
    }
  };

const handleApproveRecharge = async (recharge: any) => {
    try {
      await supabase
        .from("diamond_recharges")
        .update({ status: "APPROVED" })
        .eq("id", recharge.id);

      const rawPhone = String(recharge.phone || "").trim();
      const phoneDigits = rawPhone.replace(/\D/g, "");
      const cleanPhone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
      
      const userId = String(recharge.user_id || "").trim();
      const diamondsToAdd = Number(recharge.diamonds || 0);

      let existingProfile = null;

      if (userId) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        if (data) existingProfile = data;
      }

      if (!existingProfile && rawPhone && rawPhone !== "0000000000") {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("phone", rawPhone)
          .maybeSingle();
        if (data) existingProfile = data;
      }

      if (!existingProfile && cleanPhone.length >= 10) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .ilike("phone", `%${cleanPhone}%`)
          .maybeSingle();
        if (data) existingProfile = data;
      }

      // Sirf diamonds badhenge, gamer points par koi asar nahi padega!
      const currentDiamonds = Number(existingProfile?.redeemable_diamonds || 0);
      const updatedDiamonds = currentDiamonds + diamondsToAdd;

      if (existingProfile && existingProfile.id) {
        await supabase
          .from("profiles")
          .update({
            name: recharge.customer_name || recharge.name || existingProfile.name || "Gamer",
            redeemable_diamonds: updatedDiamonds, // Sirf diamonds update honge
            updated_at: new Date().toISOString()
          })
          .eq("id", existingProfile.id);

        if (selectedUser) {
          setSelectedUser(prev => prev ? {
            ...prev,
            redeemableDiamonds: updatedDiamonds
          } : null);
        }
      }

      await fetchUsersAndData();

      if (selectedRecharge && selectedRecharge.id === recharge.id) {
        setSelectedRecharge((prev: any) => ({ ...prev, status: "APPROVED" }));
      }
    } catch (e) {
      console.error("Failed to approve diamond recharge:", e);
    }
  };

  const handleGrantSelectedUserDiamonds = async (amount: number, diamondsToAdd: number) => {
    if (!selectedUser) return;

    try {
      const phone = String(selectedUser.phone || "").trim();
      const currentDiamonds = Number(selectedUser.redeemableDiamonds || 0);
      const currentPts = Number(selectedUser.gamerPoints || 0);

      const updatedDiamonds = currentDiamonds + diamondsToAdd;
      const updatedPts = currentPts + amount;

      let newTier = "BRONZE";
      if (updatedPts >= 5000) newTier = "LEGEND";
      else if (updatedPts >= 2500) newTier = "DIAMOND";
      else if (updatedPts >= 1000) newTier = "GOLD";
      else if (updatedPts >= 500) newTier = "SILVER";

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          redeemable_diamonds: updatedDiamonds,
          gamer_points: updatedPts,
          loyalty_tier: newTier,
          updated_at: new Date().toISOString()
        })
        .eq("phone", phone);

      if (updateErr) {
        await supabase
          .from("profiles")
          .update({
            redeemable_diamonds: updatedDiamonds,
            gamer_points: updatedPts,
            loyalty_tier: newTier,
            updated_at: new Date().toISOString()
          })
          .eq("id", selectedUser.key);
      }

      await supabase
        .from("diamond_recharges")
        .insert({
          phone: phone,
          customer_name: selectedUser.name,
          diamonds: diamondsToAdd,
          amount: amount,
          utr: "ADMIN_DIRECT_GRANT",
          status: "APPROVED"
        });

      setSelectedUser(prev => prev ? {
        ...prev,
        redeemableDiamonds: updatedDiamonds,
        gamerPoints: updatedPts,
        loyaltyTier: newTier
      } : null);

      await fetchUsersAndData();
      setConfirmPack(null);
      alert(`Successfully credited ${diamondsToAdd} Diamonds to ${selectedUser.name}!`);
    } catch (e) {
      console.error("Failed to grant diamonds:", e);
      alert("Failed to grant diamonds.");
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    try {
      await supabase.from("bookings").update({ status: "REJECTED" }).eq("id", bookingId);
      fetchUsersAndData();
      if (selectedBooking && selectedBooking.id === bookingId) {
        setSelectedBooking((prev: any) => ({ ...prev, status: "REJECTED" }));
      }
    } catch (e) {
      console.error("Failed to reject booking:", e);
    }
  };

  const handleRejectRecharge = async (rechargeId: string) => {
    try {
      await supabase.from("diamond_recharges").update({ status: "REJECTED" }).eq("id", rechargeId);
      fetchUsersAndData();
      if (selectedRecharge && selectedRecharge.id === rechargeId) {
        setSelectedRecharge((prev: any) => ({ ...prev, status: "REJECTED" }));
      }
    } catch (e) {
      console.error("Failed to reject recharge:", e);
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    try {
      await supabase.from("bookings").delete().eq("id", bookingId);
      if (selectedBooking?.id === bookingId) setSelectedBooking(null);
      fetchUsersAndData();
    } catch (e) {
      console.error("Failed to delete booking:", e);
    }
  };

  const handleDeleteRecharge = async (rechargeId: string) => {
    try {
      await supabase.from("diamond_recharges").delete().eq("id", rechargeId);
      if (selectedRecharge?.id === rechargeId) setSelectedRecharge(null);
      fetchUsersAndData();
    } catch (e) {
      console.error("Failed to delete recharge:", e);
    }
  };

  const handleDeleteUserProfile = async (user: UserProfile) => {
    if (!window.confirm(`Are you sure you want to delete profile for "${user.name}" (${user.phone})?`)) {
      return;
    }

    try {
      if (user.phone && user.phone.length >= 7) {
        await supabase.from("profiles").delete().eq("phone", user.phone);
        await supabase.from("bookings").delete().eq("phone", user.phone);
        await supabase.from("diamond_recharges").delete().eq("phone", user.phone);
      }

      if (selectedUser?.key === user.key) setSelectedUser(null);
      fetchUsersAndData();
    } catch (e) {
      console.error("Failed to delete user profile:", e);
    }
  };

  const pendingRechargesCount = allRecharges.filter(
    r => String(r.status || "").trim().toUpperCase() === "PENDING"
  ).length;

  const filteredUsers = users
    .filter((u) => {
      const sLower = search.toLowerCase();
      return (
        u.name.toLowerCase().includes(sLower) ||
        u.phone.includes(sLower) ||
        u.email.toLowerCase().includes(sLower)
      );
    })
    .sort((a, b) => {
      if (sortBy === "points-high") return b.gamerPoints - a.gamerPoints;
      if (sortBy === "points-low") return a.gamerPoints - b.gamerPoints;
      if (sortBy === "league") {
        const leagueA = getUserLeague(a.loyaltyTier, a.gamerPoints).rank;
        const leagueB = getUserLeague(b.loyaltyTier, b.gamerPoints).rank;
        if (leagueA !== leagueB) return leagueB - leagueA;
        return b.gamerPoints - a.gamerPoints;
      }
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "revenue") return b.totalSpent - a.totalSpent;
      return 0;
    });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl bg-slate-950 text-white border-slate-800 max-h-[88vh] flex flex-col p-6 font-sans">
          <DialogHeader className="border-b border-slate-800 pb-3 flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-cyan-400">
              <span className="text-xl">💎</span>
              {selectedUser ? (
                <span>Profile: {selectedUser.name}</span>
              ) : (
                <span>Customer Profiles, Bookings & Diamond Recharges</span>
              )}
            </DialogTitle>

            <div className="flex items-center gap-3">
              {!selectedUser && (
                <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setActiveTab("recharges")}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activeTab === "recharges" ? "bg-cyan-600 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    💎 Diamond Requests
                    {pendingRechargesCount > 0 && (
                      <span className="bg-red-600 text-white px-1.5 py-0.2 rounded-full text-[10px] font-black animate-pulse">
                        {pendingRechargesCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("profiles")}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      activeTab === "profiles" ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    User Profiles ({users.length})
                  </button>
                </div>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={fetchUsersAndData}
                className="text-xs text-slate-400 hover:text-white"
              >
                <RefreshCw className={`size-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </DialogHeader>

          {selectedUser ? (
            <div className="flex flex-col flex-1 overflow-y-auto space-y-4 pt-2 pr-1">
              <div className="p-4 rounded-xl bg-slate-900 border border-purple-500/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="size-14 rounded-full overflow-hidden border-2 border-purple-500/50 bg-purple-950 shrink-0 flex items-center justify-center shadow-lg">
                    {selectedUser.avatarUrl ? (
                      <img src={selectedUser.avatarUrl} alt={selectedUser.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-purple-300 font-black text-lg">
                        {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : "C"}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-white">{selectedUser.name}</h3>
                      
                      {(() => {
                        const league = getUserLeague(selectedUser.loyaltyTier, selectedUser.gamerPoints);
                        return (
                          <span className={`text-xs font-black tracking-wider px-2.5 py-1 rounded-md border uppercase flex items-center gap-1 ${league.color}`}>
                            <Trophy className="size-3.5" /> {league.name} LEAGUE
                          </span>
                        );
                      })()}

                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-950 to-purple-950 border border-cyan-400/50 px-2.5 py-1 rounded-full text-xs font-black text-cyan-300">
                        <span className="animate-pulse">💎</span>
                        <span>{selectedUser.gamerPoints} Gamer Points</span>
                      </div>

                      <div className="flex items-center gap-1.5 bg-emerald-950 border border-emerald-400/50 px-2.5 py-1 rounded-full text-xs font-black text-emerald-300">
                        <span>🪙 {selectedUser.redeemableDiamonds} Redeemable Diamonds</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-300 flex-wrap font-mono">
                      <span className="flex items-center gap-1 text-cyan-300">
                        <Phone className="size-3.5 text-cyan-400" /> {selectedUser.phone || "N/A"}
                      </span>
                      {selectedUser.email && (
                        <span className="flex items-center gap-1 text-purple-300">
                          <Mail className="size-3.5" /> {selectedUser.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="bg-red-950 hover:bg-red-900 border border-red-500/50 text-red-200 text-xs font-bold h-9 px-3"
                    onClick={() => handleDeleteUserProfile(selectedUser)}
                  >
                    <UserX className="size-4 mr-1.5" /> Delete Profile
                  </Button>
                </div>
              </div>

              {/* DIRECT GIVE DIAMONDS PACKS FOR SELECTED USER */}
              <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                    <Gem className="size-4 text-cyan-400 animate-pulse" /> Admin Quick Grant Diamonds to {selectedUser.name}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button
                    onClick={() => setConfirmPack({ amount: 500, diamonds: 600 })}
                    className="bg-cyan-950 border border-cyan-500/60 text-cyan-200 hover:bg-cyan-600 hover:text-white font-bold text-xs py-3 h-auto flex flex-col gap-1 shadow"
                  >
                    <span className="text-sm font-black text-white">₹500 Pack</span>
                    <span className="text-cyan-300">💎 600 Diamonds</span>
                  </Button>

                  <Button
                    onClick={() => setConfirmPack({ amount: 1000, diamonds: 1200 })}
                    className="bg-cyan-950 border border-cyan-500/60 text-cyan-200 hover:bg-cyan-600 hover:text-white font-bold text-xs py-3 h-auto flex flex-col gap-1 shadow"
                  >
                    <span className="text-sm font-black text-white">₹1000 Pack</span>
                    <span className="text-cyan-300">💎 1200 Diamonds</span>
                  </Button>

                  <Button
                    onClick={() => setConfirmPack({ amount: 2000, diamonds: 2500 })}
                    className="bg-cyan-950 border border-cyan-500/60 text-cyan-200 hover:bg-cyan-600 hover:text-white font-bold text-xs py-3 h-auto flex flex-col gap-1 shadow"
                  >
                    <span className="text-sm font-black text-white">₹2000 Pack</span>
                    <span className="text-cyan-300">💎 2500 Diamonds</span>
                  </Button>
                </div>
              </div>

              {/* Diamond Recharges Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
                  <span>💎</span> Diamond Recharge Requests ({selectedUser.recharges.length})
                </div>

                {selectedUser.recharges.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3 bg-slate-900/40 rounded border border-slate-800 text-center">
                    No diamond recharges found for this user.
                  </p>
                ) : (
                  selectedUser.recharges.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRecharge(r)}
                      className="p-3.5 rounded-xl border border-cyan-500/30 bg-slate-900/80 hover:border-cyan-400 transition-all cursor-pointer flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 shrink-0">
                          <span className="animate-pulse">💎</span>
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-cyan-200">
                              💎 {r.diamonds} Diamonds Pack
                            </span>
                            <Badge className={`text-[9px] font-black uppercase px-2 py-0.5 ${
                              String(r.status).toUpperCase() === 'PENDING' ? 'bg-amber-950 border-amber-500 text-amber-300 animate-pulse' : 'bg-emerald-950 border-emerald-500 text-emerald-300'
                            }`}>
                              {r.status || 'PENDING'}
                            </Badge>
                            <span className="text-xs font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                              UTR: {r.utr || "N/A"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                            <span>📅 {formatDateToReadable(new Date(r.created_at || Date.now()))}</span>
                            <span className="text-emerald-400 font-bold text-sm">₹{r.amount}</span>
                          </div>
                        </div>
                      </div>

                      {String(r.status).toUpperCase() === "PENDING" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApproveRecharge(r);
                          }}
                        >
                          <CheckCircle2 className="size-4 mr-1.5" /> Approve & Credit
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Gaming Bookings Section */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <CalendarDays className="size-4" /> Gaming Reservations & Bookings ({selectedUser.bookings.length})
                </div>

                {selectedUser.bookings.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3 bg-slate-900/40 rounded border border-slate-800 text-center">
                    No bookings found for this user.
                  </p>
                ) : (
                  selectedUser.bookings.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBooking(b)}
                      className="p-3 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:border-amber-500/50 hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <Gamepad2 className="size-4 text-amber-400" />
                        <div>
                          <span className="font-bold text-white">{b.screen || b.category || "Station"}</span>
                          <span className="text-slate-400 block font-mono">📅 {b.bookingDate || b.date} | ⏰ {b.slot_time || b.slot}</span>
                        </div>
                      </div>
                      <span className="font-bold text-emerald-400 font-mono">₹{b.price || b.amount}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-4 border-t border-slate-800">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedUser(null)}
                  className="w-full h-10 text-xs bg-slate-900 border-slate-700 hover:bg-slate-800 text-white font-bold"
                >
                  <ArrowLeft className="size-4 mr-2" /> Back to All Profiles
                </Button>
              </div>
            </div>
          ) : activeTab === "recharges" ? (
            <div className="flex flex-col flex-1 overflow-hidden space-y-3 pt-2">
              <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-cyan-500/30">
                <div className="flex items-center gap-2 text-xs text-cyan-300 font-semibold">
                  <span>💎</span> All customer diamond recharges & UTR verification requests (Click any for receipt)
                </div>
                <div className="text-xs font-mono font-bold text-slate-300">
                  Total Requests: {allRecharges.length}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {allRecharges.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No diamond recharge requests found.
                  </div>
                ) : (
                  allRecharges.map((r) => {
                    const isPending = String(r.status || "").trim().toUpperCase() === "PENDING";
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRecharge(r)}
                        className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 cursor-pointer hover:border-cyan-400 ${
                          isPending ? "bg-slate-900/90 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.15)]" : "bg-slate-900/40 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="size-11 rounded-lg bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-300 shrink-0">
                            <span className="animate-pulse">💎</span>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-white">{r.customer_name || r.name || "Gamer"}</span>
                              <span className="text-xs font-mono text-cyan-300">({r.phone || "No Phone"})</span>
                              <Badge className={`text-[9px] font-black uppercase px-2 py-0.5 ${
                                isPending ? 'bg-amber-950 border-amber-500 text-amber-300 animate-pulse' : 'bg-emerald-950 border-emerald-500 text-emerald-300'
                              }`}>
                                {r.status || 'PENDING'}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
                              <span className="text-cyan-200 font-bold">💎 {r.diamonds} Diamonds Pack</span>
                              <span className="text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">UTR: {r.utr || "N/A"}</span>
                              <span className="text-slate-400">📅 {formatDateToReadable(new Date(r.created_at || Date.now()))}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <div className="text-right font-mono">
                            <div className="font-black text-emerald-400 text-sm">₹{r.amount}</div>
                          </div>

                          {isPending && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md"
                              onClick={() => handleApproveRecharge(r)}
                            >
                              <CheckCircle2 className="size-4 mr-1.5" /> Approve & Credit
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden space-y-3 pt-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <Input
                    placeholder="Search user by name, phone number or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-slate-900 border-slate-700 text-xs text-white"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <SlidersHorizontal className="size-4 text-purple-400" />
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[180px] bg-slate-900 border-slate-700 text-xs text-white">
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                      <SelectItem value="points-high">💎 Points: High to Low</SelectItem>
                      <SelectItem value="points-low">💎 Points: Low to High</SelectItem>
                      <SelectItem value="league">🏆 League Ranking</SelectItem>
                      <SelectItem value="revenue">💰 Total Spent (Revenue)</SelectItem>
                      <SelectItem value="name">🔤 Name (A-Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No user profiles found.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const league = getUserLeague(u.loyaltyTier, u.gamerPoints);
                    const userPendingRecharges = u.recharges.filter(r => String(r.status || "").toUpperCase() === "PENDING").length;

                    return (
                      <div
                        key={u.key}
                        onClick={() => setSelectedUser(u)}
                        className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-900 hover:border-purple-500/55 transition-all cursor-pointer flex items-center justify-between gap-4 group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="relative size-11 rounded-full overflow-hidden border border-purple-500/30 bg-purple-950/80 shrink-0 flex items-center justify-center">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-purple-300 font-bold text-sm">
                                {u.name ? u.name.charAt(0).toUpperCase() : "C"}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-white truncate">{u.name}</span>
                              
                              <span className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded-md border uppercase flex items-center gap-1 ${league.color}`}>
                                <Trophy className="size-3" /> {league.name}
                              </span>

                              {userPendingRecharges > 0 && (
                                <Badge className="bg-cyan-950 text-cyan-300 border-cyan-500 text-[10px] animate-pulse">
                                  💎 {userPendingRecharges} Pending Request
                                </Badge>
                              )}

                              <div className="flex items-center gap-1 bg-cyan-950/80 border border-cyan-500/50 px-2 py-0.5 rounded-full text-[10px] font-black text-cyan-300">
                                <span>💎</span>
                                <span>{u.gamerPoints} Pts</span>
                              </div>

                              <div className="flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/50 px-2 py-0.5 rounded-full text-[10px] font-black text-emerald-300">
                                <span>🪙</span>
                                <span>{u.redeemableDiamonds} Diamonds</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap font-mono">
                              <span className="text-cyan-300">📞 {u.phone || "N/A"}</span>
                              {u.email && <span className="text-purple-300">✉️ {u.email}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-extrabold text-emerald-400 text-sm">₹{u.totalSpent}</div>
                          <span className="text-[10px] text-slate-400">{u.bookings.length} Bookings | {u.recharges.length} Recharges</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CONFIRMATION POPUP FOR GRANTING DIAMONDS */}
      {confirmPack && selectedUser && (
        <Dialog open={!!confirmPack} onOpenChange={() => setConfirmPack(null)}>
          <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-white p-6 font-sans">
            <DialogHeader className="text-center pb-3 border-b border-slate-800">
              <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 mb-2 animate-pulse">
                <Gem className="size-6" />
              </div>
              <DialogTitle className="text-lg font-black tracking-wider uppercase text-cyan-300">
                CONFIRM DIAMOND GRANT
              </DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-3 text-center">
              <p className="text-sm text-slate-300">
                Are you sure you want to credit <strong className="text-cyan-400 font-bold">💎 {confirmPack.diamonds} Diamonds</strong> (Worth ₹{confirmPack.amount}) to <strong className="text-white font-bold">{selectedUser.name}</strong>?
              </p>
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs font-mono text-slate-400">
                <div>User Phone: {selectedUser.phone}</div>
                <div>Current Diamonds: {selectedUser.redeemableDiamonds} ➔ New Total: {selectedUser.redeemableDiamonds + confirmPack.diamonds}</div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold"
                onClick={() => setConfirmPack(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg"
                onClick={() => handleGrantSelectedUserDiamonds(confirmPack.amount, confirmPack.diamonds)}
              >
                Yes, Credit Diamonds
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Booking Receipt Modal */}
      {selectedBooking && (
        <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
          <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-white p-5 font-sans">
            <DialogHeader className="text-center pb-3 border-b border-slate-800">
              <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-1.5">
                <Receipt className="size-5" />
              </div>
              <DialogTitle className="text-lg font-black tracking-wider uppercase text-amber-400">
                BOOKING DETAILS & APPROVAL
              </DialogTitle>
              <div className="mt-2 inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full font-mono text-amber-300 font-bold text-xs">
                ID: {selectedBooking.id}
              </div>
            </DialogHeader>

            <div className="space-y-2.5 py-1 text-xs font-mono">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Date:</span>
                <span className="font-semibold text-slate-200">{selectedBooking.bookingDate || selectedBooking.date || formatDateToReadable()}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Customer Name:</span>
                <span className="font-bold text-white">{selectedBooking.customer_name || selectedBooking.name || "Gamer"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Phone Number:</span>
                <span className="text-slate-300">{selectedBooking.phone || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Station / Details:</span>
                <span className="font-bold text-amber-300">{selectedBooking.screen || selectedBooking.category || "Booking"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Slot Time:</span>
                <span className="text-cyan-300">{selectedBooking.slot_time || selectedBooking.slot || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center pt-2 font-orbitron">
                <span className="text-slate-300 font-bold">Total Amount:</span>
                <span className="text-sm font-black text-emerald-400">₹{selectedBooking.price || selectedBooking.amount || "0"}</span>
              </div>
            </div>

            <div className="pt-3 flex gap-2">
              {String(selectedBooking.status).toUpperCase() === "PENDING" && (
                <>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                    onClick={() => handleApproveBooking(selectedBooking)}
                  >
                    <CheckCircle2 className="size-4 mr-1" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-500/60 text-red-400 hover:bg-red-950 font-bold text-xs"
                    onClick={() => handleRejectBooking(selectedBooking.id)}
                  >
                    <XCircle className="size-4 mr-1" /> Reject
                  </Button>
                </>
              )}
              <Button
                variant="destructive"
                className="bg-red-950 hover:bg-red-900 border border-red-500/40 text-red-300 text-xs font-bold"
                onClick={() => handleDeleteBooking(selectedBooking.id)}
              >
                <Trash2 className="size-4" />
              </Button>
              <Button className="bg-slate-800 text-white text-xs border border-slate-700 flex-1" onClick={() => setSelectedBooking(null)}>
                CLOSE
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* DIAMOND RECHARGE RECEIPT MODAL */}
      {selectedRecharge && (
        <Dialog open={!!selectedRecharge} onOpenChange={() => setSelectedRecharge(null)}>
          <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-white p-5 font-sans">
            <DialogHeader className="text-center pb-3 border-b border-slate-800">
              <div className="mx-auto w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-1.5 animate-pulse">
                <span>💎</span>
              </div>
              <DialogTitle className="text-lg font-black tracking-wider uppercase text-cyan-400">
                DIAMOND RECHARGE RECEIPT
              </DialogTitle>
              <div className="text-xs text-slate-400 mt-0.5">Stranger's Gaming Cafe</div>
              <div className="mt-2 inline-block px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full font-mono text-cyan-300 font-bold text-[10px]">
                RECORD ID: {selectedRecharge.id}
              </div>
            </DialogHeader>

            <div className="space-y-2.5 py-1 text-xs font-mono">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Date:</span>
                <span className="font-semibold text-slate-200">{formatDateToReadable(new Date(selectedRecharge.created_at || Date.now()))}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Customer Name:</span>
                <span className="font-bold text-white">{selectedRecharge.customer_name || selectedRecharge.name || "Gamer"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Phone Number:</span>
                <span className="text-slate-300">{selectedRecharge.phone || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Diamond Pack:</span>
                <span className="font-bold text-cyan-300">💎 {selectedRecharge.diamonds} Diamonds</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">UTR Reference:</span>
                <span className="text-purple-300 font-bold">{selectedRecharge.utr || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Status:</span>
                <Badge className={`text-[9px] font-black uppercase px-2 py-0.5 ${
                  String(selectedRecharge.status).toUpperCase() === 'PENDING' ? 'bg-amber-950 border-amber-500 text-amber-300 animate-pulse' : 'bg-emerald-950 border-emerald-500 text-emerald-300'
                }`}>
                  {selectedRecharge.status || 'PENDING'}
                </Badge>
              </div>
              <div className="flex justify-between items-center pt-2 font-orbitron">
                <span className="text-slate-300 font-bold">Total Amount:</span>
                <span className="text-sm font-black text-emerald-400">₹{selectedRecharge.amount || "0"}</span>
              </div>
            </div>

            <div className="pt-3 flex gap-2">
              {String(selectedRecharge.status).toUpperCase() === "PENDING" && (
                <>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                    onClick={() => handleApproveRecharge(selectedRecharge)}
                  >
                    <CheckCircle2 className="size-4 mr-1" /> Approve & Credit
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-500/60 text-red-400 hover:bg-red-950 font-bold text-xs"
                    onClick={() => handleRejectRecharge(selectedRecharge.id)}
                  >
                    <XCircle className="size-4 mr-1" /> Reject
                  </Button>
                </>
              )}
              <Button
                variant="destructive"
                className="bg-red-950 hover:bg-red-900 border border-red-500/40 text-red-300 text-xs font-bold"
                onClick={() => handleDeleteRecharge(selectedRecharge.id)}
              >
                <Trash2 className="size-4" />
              </Button>
              <Button className="bg-slate-800 text-white text-xs border border-slate-700 flex-1" onClick={() => setSelectedRecharge(null)}>
                CLOSE
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
