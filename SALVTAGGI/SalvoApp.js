import React, { useState, useEffect } from 'react'; //App.js
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Platform
} from 'react-native';

// --- IMPORTAZIONI SCHERMATE (TUTTE) ---
import AdminHome from './AdminHome';
import CollaboratorHome from './CollaboratorHome';
import PendingApprovalScreen from './PendingApprovalScreen';
import CreateShiftScreen from './CreateShiftScreen';
import FounderHome from './FounderHome';
import AdminStaffScreen from './AdminStaffScreen';
import ShiftManagementScreen from './ShiftManagementScreen';

// --- IMPORTAZIONI NUOVE FUNZIONI (VITALI PER NON ROMPERE I TASTI) ---
import CollaboratorHistoryScreen from './CollaboratorHistoryScreen';
import PayrollScreen from './PayrollScreen';
import ModificaTurno from './ModificaTurno';

// --- IMPORT FIREBASE ---
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

// --- COMPONENTE AUTH (LOGIN/REGISTRAZIONE - DESIGN PULITO) ---
const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationRole, setRegistrationRole] = useState('COLLABORATORE');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) { Alert.alert("Attenzione", "Compila tutti i campi."); return; }
    if (password !== confirmPassword) { Alert.alert("Errore", "Le password non coincidono."); return; }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const role = registrationRole;
      const isApproved = (role === "FOUNDER");

      await setDoc(doc(db, "users", user.uid), {
        lastName: lastName,
        firstName: firstName,
        email: user.email,
        role: role,
        isApproved: isApproved,
        createdAt: new Date(),
        adminRequest: role === 'AMMINISTRATORE',
      });

      setLoading(false);
      Alert.alert("ISCRIZIONE INVIATA", `Account creato in attesa di approvazione.`);
      setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    } catch (error) {
      setLoading(false);
      Alert.alert("Errore", error.message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert("Attenzione", "Compila tutti i campi."); return; }
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const docSnap = await getDoc(doc(db, "users", user.uid));
     
      if (!docSnap.exists()) {
        await signOut(auth);
        Alert.alert("Accesso Negato", "Utente non trovato nel database.");
        setLoading(false);
        return;
      }
      setLoading(false);
    } catch (error) {
      setLoading(false);
      Alert.alert("Errore Login", "Credenziali non valide o errore di connessione.");
    }
  };

  const handleOpenWebsite = () => Linking.openURL('https://www.moviegroup.it').catch(err => console.error("Errore link", err));

  return (
    <>
      <View style={styles.websiteLinkContainer}>
        <TouchableOpacity onPress={handleOpenWebsite}><Text style={styles.websiteLinkText}>SITO WEB</Text></TouchableOpacity>
      </View>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{isLogin ? "Accedi" : "Crea Account"}</Text>
            <Text style={styles.subtitle}>Unisciti a Movie Group</Text>
          </View>
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="email@esempio.com" placeholderTextColor="#64748b" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/>
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} placeholder="********" placeholderTextColor="#64748b" value={password} onChangeText={setPassword} secureTextEntry/>
           
            {!isLogin && (
              <>
                <Text style={styles.label}>Nome</Text>
                <TextInput style={styles.input} placeholder="Nome" placeholderTextColor="#64748b" value={firstName} onChangeText={setFirstName}/>
                <Text style={styles.label}>Cognome</Text>
                <TextInput style={styles.input} placeholder="Cognome" placeholderTextColor="#64748b" value={lastName} onChangeText={setLastName}/>
                <Text style={styles.label}>Conferma Password</Text>
                <TextInput style={styles.input} placeholder="********" placeholderTextColor="#64748b" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry/>
               
                <View style={styles.switchContainer}>
                  <Text style={styles.switchLabel}>Registrati come: <Text style={{fontWeight:'bold', color:'#22d3ee'}}>{registrationRole}</Text></Text>
                  <TouchableOpacity
                    onPress={() => {
                        if(registrationRole==='COLLABORATORE') setRegistrationRole('AMMINISTRATORE');
                        else if(registrationRole==='AMMINISTRATORE') setRegistrationRole('FOUNDER');
                        else setRegistrationRole('COLLABORATORE');
                    }}
                    style={{backgroundColor:'#0e7490', padding:8, borderRadius:8}}
                  >
                    <Text style={{color:'#fff'}}>Cambia</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.button} onPress={isLogin ? handleLogin : handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>{isLogin ? "Accedi" : "Registrati"}</Text>}
            </TouchableOpacity>
           
            <TouchableOpacity style={styles.linkButton} onPress={() => setIsLogin(!isLogin)}>
              <Text style={styles.linkText}>{isLogin ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}</Text>
            </TouchableOpacity>
           
            <View style={styles.companyInfo}>
              <Text style={styles.companyInfoText}>Movie Group Firenze</Text>
              <Text style={styles.companyInfoText}>Tel: [+39 350 113 3230]</Text>
              <Text style={styles.companyInfoText}>P.IVA: [INSERISCI P.IVA QUI]</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};

// --- ROUTER PRINCIPALE (APP) ---
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loadingApp, setLoadingApp] = useState(true);
 
  const [shiftCreationParams, setShiftCreationParams] = useState({});
  const [screenOverride, setScreenOverride] = useState(null);

  const handleNavigate = (screenName, params = {}) => {
    setShiftCreationParams(params);
    setScreenOverride(screenName);
  };

  const handleGoBack = () => {
      setShiftCreationParams({});
      setScreenOverride(null);
  };

  const fetchUserRole = async (uid) => {
    try {
      const docSnap = await getDoc(doc(db, "users", uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.isApproved === false) {
           setUserRole({ status: "PENDING_APPROVAL", originalRole: data.role });
        } else {
           setUserRole(data.role);
        }
      } else {
         setUserRole(null);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingApp(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
       setCurrentUser(user);
       if (user) {
           await fetchUserRole(user.uid);
       } else {
           setUserRole(null);
           setLoadingApp(false);
           setScreenOverride(null);
       }
    });
    return unsubscribe;
  }, []);

  if (loadingApp) return <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color="#06b6d4"/></View>;
  if (!currentUser) return <AuthScreen />;
 
  if (userRole && typeof userRole === 'object' && userRole.status === "PENDING_APPROVAL") {
      return <PendingApprovalScreen userRole={userRole.originalRole} />;
  }

  // --- LOGICA DI NAVIGAZIONE POTENZIATA (Design Pulito + Funzioni) ---

  // 1. CREATE SHIFT
  if (screenOverride === 'CreateShiftScreen') {
      return <CreateShiftScreen navigation={{ goBack: handleGoBack }} route={{ params: shiftCreationParams }} />;
  }

  // 2. MODIFICA TURNO (Nuovo!)
  if (screenOverride === 'ModificaTurno') {
      return <ModificaTurno navigation={{ goBack: handleGoBack }} route={{ params: shiftCreationParams }} />;
  }

  // 3. GESTIONE STAFF
  if (screenOverride === 'AdminStaffScreen') {
      return <AdminStaffScreen navigation={{ goBack: handleGoBack }} route={{ params: shiftCreationParams }} />;
  }

  // 4. GESTIONE TURNI (Passiamo 'navigate' per permettere la modifica!)
  if (screenOverride === 'ShiftManagementScreen') {
      return <ShiftManagementScreen navigation={{ goBack: handleGoBack, navigate: handleNavigate }} route={{ params: shiftCreationParams }} />;
  }

  // 5. BUSTE PAGA (Nuovo!)
  if (screenOverride === 'PayrollScreen') {
      return <PayrollScreen onBack={handleGoBack} />;
  }

  // --- HOME PAGE PER RUOLO ---

  if (userRole === "FOUNDER") {
    return <FounderHome navigation={{ navigate: handleNavigate }} />;
  }

  if (userRole === "AMMINISTRATORE") {
    return <AdminHome navigation={{ navigate: handleNavigate }} />;
  }

  // COLLABORATORE (Con Storico)
  if (userRole === "COLLABORATORE") {
  // 1. Se l'utente ha cliccato "Storico", mostriamo quella schermata
    if (screenOverride === 'CollaboratorHistory') {
        return <CollaboratorHistoryScreen onBack={() => setScreenOverride(null)} />;
    }
  // 2. Altrimenti mostriamo la Home, MA GLI PASSIAMO LA FUNZIONE (la chiave!)
    return <CollaboratorHome onNavigateHistory={() => setScreenOverride('CollaboratorHistory')} />;
  }
}
// --- STILI (Rimangono invariati per coerenza) ---
const styles = StyleSheet.create({ // RIGA 414
  container: { flex: 1, backgroundColor: '#0f172a' }, // RIGA 415
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 }, // RIGA 416
header: {
    alignItems: 'center',
    marginBottom: 40, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 0, },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffff', marginBottom: 8 }, // RIGA 420
  subtitle: { fontSize: 16, color: '#94a3b8' }, // RIGA 421
  form: { width: '100%' }, // RIGA 422
  label: { color: '#cbd5e1', marginBottom: 8, fontSize: 14, marginLeft: 4 },
  input: { backgroundColor: '#1e293b', color: '#ffffff', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, marginBottom: 20, fontSize: 16, borderWidth: 1, borderColor: '#334155' },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 30, borderWidth: 1, borderColor: '#334155' },
  switchLabel: { color: '#ffffff', fontSize: 14, flex: 1 },
  button: { backgroundColor: '#06b6d4', paddingVertical: 16, borderRadius: 12, alignItems: 'center', shadowColor: '#22d3ee', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  linkButton: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#94a3b8', fontSize: 14 },
    websiteLinkContainer: {
    alignItems: 'flex-end',
    paddingTop: 10,
    paddingRight: 10,
    position: 'absolute',
    top: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    right: 0,
    zIndex: 10,
  },
  websiteLinkText: {
    color: '#22d3ee', // Colore ciano chiaro RIGA 441
    fontSize: 14,
    fontWeight: 'bold',
  },
  companyInfo: {
    marginTop: 40,
    alignItems: 'center',
    paddingBottom: 20,
  },
  companyInfoText: {
    color: '#64748b', // Grigio sbiadito RIGA 451
    fontSize: 12,
    marginTop: 2,
  }, // RIGA 454
});