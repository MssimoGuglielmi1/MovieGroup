import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert, Platform, StatusBar, ActivityIndicator, Linking } from 'react-native'; // Aggiunto Linking
import { Feather } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { collection, query, where, doc, updateDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';

// --- DESIGN SYSTEM ---
const Colors = {
    background: '#000000', surface: '#1C1C1E', primary: '#4CAF50', accent: '#0A84FF',
    textMain: '#FFFFFF', textSub: '#8E8E93', border: '#2C2C2E', error: '#FF453A',
    cyan: '#00D1FF'
};

// Header
const Header = ({ adminName, onLogout, onProfilePress }) => (
  <View style={styles.headerContainer}>
    <TouchableOpacity onPress={onProfilePress}>
        <Text style={styles.headerTitle}>{adminName ? `Ciao, ${adminName}` : "Admin Dashboard"}</Text>
        <Text style={styles.headerSubtitle}>Profilo e Dati ⚙️</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={onLogout} style={styles.iconButton}>
        <Feather name="log-out" size={22} color={Colors.error} />
    </TouchableOpacity>
  </View>
);

const StatTile = ({ label, value, icon, color, onPress }) => (
  <TouchableOpacity style={[styles.tile, { borderLeftColor: color }]} onPress={onPress} disabled={!onPress}>
    <View style={styles.tileHeader}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Feather name={icon} size={20} color={color} />
    </View>
    <Text style={styles.tileValue}>{value}</Text>
  </TouchableOpacity>
);

export default function AdminHome({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [activeCollaborators, setActiveCollaborators] = useState([]);
  const [shiftsCount, setShiftsCount] = useState(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    // 1. Nome Admin
    getDoc(doc(db, "users", user.uid)).then(snap => {
        if (snap.exists()) setAdminName(snap.data().firstName);
    });

    // 2. Utenti in attesa (L'Admin può ancora approvare, giusto?)
    const qPending = query(collection(db, "users"), where("isApproved", "==", false));
    const unsubPending = onSnapshot(qPending, (snap) => {
        setPendingUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. STAFF OPERATIVO (SOLO COLLABORATORI, NIENTE ADMIN)
    const qActive = query(
        collection(db, "users"),
        where("isApproved", "==", true),
        where("role", "==", "COLLABORATORE") // Filtro Rigido
    );
    const unsubActive = onSnapshot(qActive, (snap) => {
        setActiveCollaborators(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 4. Conteggio Turni
    const qShifts = query(collection(db, "shifts"), where("status", "in", ["assegnato", "accettato", "in-corso"]));
    const unsubShifts = onSnapshot(qShifts, (snap) => {
        setShiftsCount(snap.size);
        setLoading(false);
    });

    return () => { unsubPending(); unsubActive(); unsubShifts(); };
  }, []);

  // --- AZIONI ---
  const handleLogout = () => {
    Alert.alert("Logout", "Vuoi uscire?", [{ text: "No", style: "cancel" }, { text: "Esci", style: "destructive", onPress: () => signOut(auth) }]);
  };

  const handleApprove = async (userId) => {
    try { await updateDoc(doc(db, "users", userId), { isApproved: true }); }
    catch (e) { Alert.alert("Errore", e.message); }
  };

  const handleReject = async (userId) => {
    try { await deleteDoc(doc(db, "users", userId)); }
    catch (e) { Alert.alert("Errore", e.message); }
  };

  // NUOVA AZIONE: CHIAMA COLLABORATORE
  const handleCallCollaborator = (phoneNumber) => {
      if (phoneNumber && phoneNumber.length > 5) {
          // Pulisce il numero da spazi e chiama
          Linking.openURL(`tel:${phoneNumber.replace(/\s/g, '')}`);
      } else {
          // Messaggio professionale se il numero manca
          Alert.alert(
              "Recapito non disponibile",
              "Il collaboratore non ha ancora fornito un numero di telefono nel suo profilo."
          );
      }
  };

  // Navigazione
  const goToShiftMgmt = () => navigation.navigate('ShiftManagementScreen');
  const handleCreateShift = () => navigation.navigate('CreateShiftScreen', { activeCollaborators: activeCollaborators });
  const goToProfile = () => navigation.navigate('CamerinoStaff');

  if (loading) return <View style={[styles.safeArea, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator color={Colors.primary} size="large"/></View>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
     
      <Header adminName={adminName} onLogout={handleLogout} onProfilePress={goToProfile} />

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.tilesGrid}>
            <StatTile
                label="Richieste Accesso"
                value={pendingUsers.length}
                icon="user-plus"
                color={pendingUsers.length > 0 ? Colors.error : Colors.cyan}
                onPress={null}
            />
            <StatTile
                label="Turni Attivi"
                value={shiftsCount}
                icon="calendar"
                color={Colors.primary}
                onPress={goToShiftMgmt}
            />
        </View>

        {/* LISTA RICHIESTE APPROVAZIONE */}
        {pendingUsers.length > 0 && (
            <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: Colors.error}]}>⚠️ UTENTI IN ATTESA ({pendingUsers.length})</Text>
                {pendingUsers.map(user => (
                <View key={user.id} style={[styles.cardItem, {borderColor: Colors.error}]}>
                    <View style={{flex: 1}}>
                        <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
                        <Text style={styles.cardSubtitle}>Ruolo: {user.role}</Text>
                    </View>
                    <View style={styles.actionsRow}>
                        <TouchableOpacity onPress={() => handleReject(user.id)} style={[styles.actionBtn, { borderColor: Colors.error, borderWidth: 1 }]}>
                            <Feather name="x" size={18} color={Colors.error} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleApprove(user.id)} style={[styles.actionBtn, { backgroundColor: Colors.primary, marginLeft: 10 }]}>
                            <Feather name="check" size={18} color="#000" />
                        </TouchableOpacity>
                    </View>
                </View>
                ))}
            </View>
        )}

        {/* LISTA STAFF OPERATIVO (SOLO CHIAMATE) */}
        <View style={styles.section}>
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                <Text style={styles.sectionTitle}>STAFF OPERATIVO ({activeCollaborators.length})</Text>
            </View>

            {activeCollaborators.length === 0 ? (
                <Text style={styles.emptyText}>Nessun collaboratore attivo.</Text>
            ) : (
                activeCollaborators.map(user => (
                  <View key={user.id} style={styles.cardItem}>
                    <View style={{flex: 1}}>
                        <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
                        <Text style={styles.cardSubtitle}>{user.email}</Text>
                        {/* Indicatore se ha il numero o no */}
                        {user.phoneNumber ?
                            <Text style={{fontSize:10, color:Colors.primary, marginTop:2}}>📞 {user.phoneNumber}</Text> :
                            <Text style={{fontSize:10, color:Colors.textSub, marginTop:2, fontStyle:'italic'}}>Nessun numero</Text>
                        }
                    </View>
                   
                    {/* TASTO CHIAMA (VERDE) AL POSTO DEL CESTINO */}
                    <TouchableOpacity
                        onPress={() => handleCallCollaborator(user.phoneNumber)}
                        style={[
                            styles.actionBtn,
                            { backgroundColor: user.phoneNumber ? Colors.primary+'20' : Colors.border, borderWidth:1, borderColor: user.phoneNumber ? Colors.primary : Colors.border }
                        ]}
                    >
                        <Feather name="phone" size={18} color={user.phoneNumber ? Colors.primary : Colors.textSub} />
                    </TouchableOpacity>
                  </View>
                ))
            )}
        </View>

        <TouchableOpacity style={styles.mainFab} onPress={handleCreateShift}>
          <Feather name="plus" size={24} color="#000" />
          <Text style={styles.fabText}>CREA NUOVO TURNO</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 22, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
  headerSubtitle: { fontSize: 14, color: Colors.textSub, textDecorationLine:'underline' },
  iconButton: { padding: 5 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  tilesGrid: { flexDirection: 'row', gap: 15, marginBottom: 30 },
  tile: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 15, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border },
  tileHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  tileLabel: { fontSize: 10, fontWeight: 'bold', color: Colors.textSub },
  tileValue: { fontSize: 28, fontWeight: 'bold', color: Colors.textMain },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textSub, textTransform: 'uppercase' },
  cardItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textMain },
  cardSubtitle: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  emptyText: { color: Colors.textSub, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  actionsRow: { flexDirection: 'row' },
  actionBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mainFab: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 30, marginTop: 10, shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  fabText: { color: '#000', fontWeight: '900', fontSize: 16, marginLeft: 8, letterSpacing: 1 },
});