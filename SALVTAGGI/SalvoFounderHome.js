import React, { useState, useCallback, useEffect } from 'react'; //FounderHome.js
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

const ColorSchemes = {
  dark: {
    background: '#0D1117',
    surface: '#161B22',
    textPrimary: '#F0F6FC',
    textSecondary: '#C9D1D9',
    textFaded: '#8B949E',
    accentCyan: '#00D1FF',
    accentGreen: '#238636',
    accentRed: '#DA3633',
    accentPurple: '#A371F7',
    divider: '#30363D',
  },
  light: {
    background: '#FFFFFF',
    surface: '#F6F8FA',
    textPrimary: '#24292F',
    textSecondary: '#57606A',
    textFaded: '#6E7781',
    accentCyan: '#0969DA',
    accentGreen: '#1A7F37',
    accentRed: '#CF222E',
    accentPurple: '#8250DF',
    divider: '#D0D7DE',
  },
};

const Header = ({ title, theme, toggleTheme, onLogout, Colors }) => (
  <View style={styles(Colors).headerContainer}>
    <View>
        <Text style={styles(Colors).headerTitle}>{title}</Text>
        <Text style={styles(Colors).headerSubtitle}>CEO / Founder Access</Text>
    </View>
    <View style={styles(Colors).headerActions}>
      <TouchableOpacity onPress={toggleTheme} style={styles(Colors).iconButton}>
        <Feather name={theme === 'dark' ? "sun" : "moon"} size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onLogout} style={styles(Colors).iconButton}>
        <Feather name="log-out" size={22} color={Colors.accentRed} />
      </TouchableOpacity>
    </View>
  </View>
);

const StatTile = ({ label, value, icon, color, Colors, onPress }) => {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      style={[styles(Colors).tile, { borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles(Colors).tileHeader}>
        <Text style={styles(Colors).tileLabel}>{label}</Text>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={styles(Colors).tileValue}>{value}</Text>
    </Container>
  );
};

export default function FounderHome({ navigation }) {
  const [theme, setTheme] = useState('dark');
  const Colors = ColorSchemes[theme];
  const toggleTheme = useCallback(() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark')), []);

  const [isLoading, setIsLoading] = useState(true);
  const [pendingAdmins, setPendingAdmins] = useState([]);
  const [activeStaff, setActiveStaff] = useState([]);
  const [pendingAccess, setPendingAccess] = useState([]);
  const [shiftsPending, setShiftsPending] = useState([]);
  const [shiftsActive, setShiftsActive] = useState([]);
  const [shiftsCompleted, setShiftsCompleted] = useState([]);

  useEffect(() => {
    setIsLoading(true);

    // FIX QUERY: Rimuoviamo il filtro sul ruolo. Prendiamo TUTTI quelli che chiedono admin.
    const pendingAdminsQuery = query(
      collection(db, "users"),
      where("adminRequest", "==", true)
    );

    const activeStaffQuery = query(
      collection(db, "users"),
      where("isApproved", "==", true)
    );

    const pendingAccessQuery = query(
      collection(db, "users"),
      where("isApproved", "==", false)
    );

    const activeShiftsQuery = query(
        collection(db, "shifts"),
        where("status", "in", ['assegnato', 'accettato', 'rifiutato', 'in_corso'])
    );

    const completedShiftsQuery = query(
        collection(db, "shifts"),
        where("status", "==", 'completato')
    );

    let loadedCount = 0;
    const checkLoadingComplete = () => {
        loadedCount++;
        if (loadedCount >= 5) setIsLoading(false);
    };

    const unsubscribePending = onSnapshot(pendingAdminsQuery, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingAdmins(fetched);
      checkLoadingComplete();
    }, () => checkLoadingComplete());

    const unsubscribeAccess = onSnapshot(pendingAccessQuery, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPendingAccess(fetched);
        checkLoadingComplete();
    }, () => checkLoadingComplete());

    const unsubscribeActive = onSnapshot(activeStaffQuery, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveStaff(fetched.filter(user => user.role !== 'FOUNDER'));
      checkLoadingComplete();
    }, () => checkLoadingComplete());

    const unsubscribeActiveShifts = onSnapshot(activeShiftsQuery, (snapshot) => {
        const fetchedShifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setShiftsPending(fetchedShifts.filter(s => s.status === 'assegnato' || s.status === 'rifiutato'));
        setShiftsActive(fetchedShifts.filter(s => s.status === 'accettato' || s.status === 'in_corso'));
        checkLoadingComplete();
    }, () => checkLoadingComplete());

    const unsubscribeCompletedShifts = onSnapshot(completedShiftsQuery, (snapshot) => {
        const fetchedShifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setShiftsCompleted(fetchedShifts);
        checkLoadingComplete();
    }, () => checkLoadingComplete());

    return () => {
      unsubscribePending();
      unsubscribeActive();
      unsubscribeAccess();
      unsubscribeActiveShifts();
      unsubscribeCompletedShifts();
    };
  }, []);

  const handleLogout = () => {
    Alert.alert("Logout", "Vuoi uscire?", [{ text: "No", style: "cancel" }, { text: "Si", onPress: async () => signOut(auth) }]);
  };

  const handleCreateShift = () => {
    const founderId = auth.currentUser ? auth.currentUser.uid : null;
    const collaboratorsForShift = activeStaff.filter(user => user.role !== 'FOUNDER');
    if (founderId) navigation.navigate('CreateShiftScreen', { activeCollaborators: collaboratorsForShift, creatorId: founderId });
  };

  const navigateToPendingAccess = () => {
    // LOGICA DI UNIONE INTELLIGENTE (EVITA DOPPIONI)
    // 1. Prendiamo tutti quelli che chiedono Admin (priorità alta)
    const admins = pendingAdmins.map(r => ({
        ...r, mode: 'PENDING_ADMINS', role: r.role || 'COLLABORATORE', adminRequest: true
    }));

    // 2. Prendiamo gli altri (pendingAccess), ma ESCLUDIAMO quelli che sono già nella lista admin
    const others = pendingAccess
        .filter(access => !admins.find(admin => admin.id === access.id))
        .map(r => ({
            ...r, mode: 'PENDING_ACCESS', role: r.role || 'COLLABORATORE'
        }));

    const allPendingRequests = [...admins, ...others];

    navigation.navigate('AdminStaffScreen', {
      title: 'Richieste Accesso',
      data: allPendingRequests,
      mode: 'PENDING_ACCESS_ALL',
      handleAccept: async (id, role) => {
          // Se approviamo un Admin, togliamo il flag di richiesta
          const updates = { isApproved: true, role: role };
          if(role === 'AMMINISTRATORE') updates.adminRequest = false;
          await updateDoc(doc(db, "users", id), updates);
      },
      handleReject: async (id) => { await deleteDoc(doc(db, "users", id)); },
    });
  };

  const navigateToTotalStaff = () => navigation.navigate('AdminStaffScreen', { title: 'Gestione Staff', data: activeStaff, mode: 'ACTIVE_STAFF' });
  const navigateToShiftSummary = () => navigation.navigate('ShiftManagementScreen', { shiftsPending, shiftsActive, shiftsCompleted });
  const navigateToPayroll = () => navigation.navigate('PayrollScreen');

  // Calcolo totale unico (unendo le due liste senza doppioni per il contatore)
  const uniquePendingCount = new Set([...pendingAdmins.map(u=>u.id), ...pendingAccess.map(u=>u.id)]).size;

  return (
    <SafeAreaView style={styles(Colors).safeArea}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
      <Header title="Founder Home" theme={theme} toggleTheme={toggleTheme} onLogout={handleLogout} Colors={Colors} />
      <ScrollView contentContainerStyle={styles(Colors).scrollContent}>
       
        {/* WIDGET RICHIESTE (ORA CONTA CORRETTAMENTE) */}
        <View style={styles(Colors).tilesGrid}>
          <StatTile
                label="Richieste Di Registrazione"
                value={uniquePendingCount}
                icon="user-plus"
                color={Colors.accentRed}
                Colors={Colors}
                onPress={navigateToPendingAccess}
          />
        </View>

        <StatTile label="Totale Staff" value={activeStaff.length} icon="users" color={Colors.accentCyan} Colors={Colors} onPress={activeStaff.length > 0 ? navigateToTotalStaff : null} />

        <View style={{marginTop: 15}}>
            <StatTile label="Gestione Turni" value={shiftsPending.length + shiftsActive.length + shiftsCompleted.length} icon="calendar" color={Colors.accentGreen} Colors={Colors} onPress={navigateToShiftSummary} />
        </View>

        <View style={styles(Colors).tilesGrid}>
          <StatTile label="Buste Paga (Da Saldare)" value="€ -->" icon="dollar-sign" color={Colors.accentGreen} Colors={Colors} onPress={navigateToPayroll} />
        </View>

        <TouchableOpacity style={styles(Colors).mainFab} onPress={handleCreateShift}>
          <Feather name="plus" size={24} color="#FFF" />
          <Text style={styles(Colors).fabText}>CREA UN NUOVO TURNO (FOUNDER)</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (Colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 10, color: Colors.accentPurple, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  headerActions: { flexDirection: 'row' },
  iconButton: { marginLeft: 15, padding: 5 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  tilesGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  tile: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 15, borderLeftWidth: 4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  tileHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tileLabel: { fontSize: 11, fontWeight: '700', color: Colors.textFaded, textTransform: 'uppercase' },
  tileValue: { fontSize: 24, fontWeight: 'bold', color: Colors.textPrimary },
  mainFab: { backgroundColor: Colors.accentPurple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 30, marginTop: 10, elevation: 4 },
  fabText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
});
