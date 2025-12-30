//App.js
import React, { useState, useEffect } from 'react';
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
  Platform,
  Image,
  AppState
} from 'react-native';

import { registerForPushNotificationsAsync } from './Notifiche';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as Updates from 'expo-updates';

// --- IMPORTAZIONI SCHERMATE ---
import AdminHome from './AdminHome';
import CollaboratorHome from './CollaboratorHome';
import PendingApprovalScreen from './PendingApprovalScreen';
import CreateShiftScreen from './CreateShiftScreen';
import FounderHome from './FounderHome';
import AdminStaffScreen from './AdminStaffScreen';
import ShiftManagementScreen from './ShiftManagementScreen';
import MostroRivoluzionario from './MostroRivoluzionario';
import StoricoFounder from './StoricoFounder';
import PDFDelFounder from './PDFDelFounder';
import TurnoDimenticato from './TurnoDimenticato';
import CollaboratorHistoryScreen from './CollaboratorHistoryScreen';
import ModificaTurno from './ModificaTurno';
import CamerinoStaff from './CamerinoStaff';
import AvvioApp from './AvvioApp';

// --- IMPORT FIREBASE ---
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail
} from 'firebase/auth';

import { doc, setDoc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

// --- COMPONENTE AUTH (LOGIN/REGISTRAZIONE) ---
const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // DEFAULT: COLLABORATORE (Founder rimosso)
  const [registrationRole, setRegistrationRole] = useState('COLLABORATORE');
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // --- FUNZIONI CONTATTO ---
  const handleEmailSupport = () => Linking.openURL('mailto:moviegroupfirenze@gmail.com'); 
  const handleWhatsAppSupport = () => Linking.openURL('https://wa.me/393501133230');
  const handleOpenWebsite = () => Linking.openURL('https://www.moviegroup.it').catch(err => console.error("Errore link", err));

// ... dentro AuthScreen in App.js ...

// 1. FUNZIONE HELPER "BILINGUE" (WEB + APP) 🌍📱
const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
        // Sul PC usiamo il popup del browser
        window.alert(`${title}\n\n${message}`);
    } else {
        // Sul Telefono usiamo il popup nativo
        Alert.alert(title, message);
    }
};

// 1. VALIDATORE EMAIL "NAZISTA" (Solo Domini Famosi) 🛡️⛔
const isValidEmail = (email) => {
    // A. Regex Base
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;

    // B. LISTA BIANCA (Accetta SOLO questi, blocca tutto il resto)
    const allowedDomains = [
        'gmail.com', 
        'libero.it', 
        'hotmail.com', 'hotmail.it', 
        'yahoo.com', 'yahoo.it',
        'icloud.com',
        'outlook.com', 'outlook.it',
        'live.com', 'live.it',
        'virgilio.it',
        'alice.it'
    ];

    const domain = email.split('@')[1].toLowerCase();

    // Se il dominio NON è nella lista bianca, BLOCCA.
    if (!allowedDomains.includes(domain)) {
        return false; 
    }

    return true;
};

const handleRegister = async () => {
    // A. CONTROLLO CAMPI VUOTI
    if (!email || !password || !confirmPassword || !firstName || !lastName) { 
        showAlert("Attenzione", "Compila tutti i campi obbligatori (Nome, Cognome, Email, Password)."); 
        return; 
    }

    // B. CONTROLLO FORMATO EMAIL
if (!isValidEmail(email)) {
        showAlert("Email Non Supportata", "Per sicurezza accettiamo solo email classiche (Gmail, Libero, Hotmail, Yahoo, ecc).\n\nSe hai una mail aziendale particolare, contattaci.");
        return;
    }

    // C. CONTROLLO PASSWORD DIVERSE
    if (password !== confirmPassword) { 
        showAlert("Errore Password", "Le due password inserite NON coincidono.\nRiprova."); 
        return; 
    }

    // D. CONTROLLO LUNGHEZZA
    if (password.length < 6) {
        showAlert("Password Debole", "La password deve avere almeno 6 caratteri.");
        return;
    }

    setLoading(true);
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const role = registrationRole;
        const isApproved = false; 

        await setDoc(doc(db, "users", user.uid), {
            lastName: lastName.trim(),
            firstName: firstName.trim(),
            email: user.email,
            role: role,
            isApproved: isApproved,
            createdAt: new Date(),
            adminRequest: role === 'AMMINISTRATORE',
            emailVerified: false 
        });

        try { await sendEmailVerification(user); } catch (e) {}

        setLoading(false);
        showAlert("ISCRIZIONE RIUSCITA 📧", "Controlla la tua email per verificare l'account e attendi l'approvazione.");
        
        setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setConfirmPassword('');

    } catch (error) {
        setLoading(false);
        
        let msg = "Errore durante la registrazione.";
        if (error.code === 'auth/email-already-in-use') {
            msg = "Questa email è già registrata!\nFai il Login o recupera la password.";
        } else if (error.code === 'auth/invalid-email') {
            msg = "L'email inserita non è valida.";
        }
        
        showAlert("Errore Registrazione", msg);
    }
};

const handleLogin = async () => {
    // A. Controllo Campi
    if (!email || !password) { 
        showAlert("Attenzione", "Inserisci Email e Password."); 
        return; 
    }

    // B. Controllo preventivo Email
    if (!isValidEmail(email)) {
        showAlert("Email Errata", "Hai scritto un'email non valida (controlla @ o spazi).");
        return;
    }

    setLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        setLoading(false);
        
        let msg = "Errore di connessione.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            msg = "Email o Password sbagliate.\nControlla e riprova.";
       } else if (error.code === 'auth/too-many-requests') {
            msg = "⚠️ TROPPI TENTATIVI! Google ha bloccato l'accesso per sicurezza.\n\nSOLUZIONE RAPIDA: Clicca su 'Password dimenticata?' qui sotto per reimpostarla e sbloccarti subito, oppure attendi 10/15 minuti.";
       } else if (error.code === 'auth/user-disabled') {
            msg = "Il tuo account è stato disabilitato.";
       }
        showAlert("Accesso Negato", msg);
    }
};

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <SafeAreaView style={{ flex: 1 }}>
        {/* MODIFICA QUI:
            Se è Login -> justifyContent: 'center' (centrato)
            Se è Registrazione -> justifyContent: 'flex-start' (parte dall'alto)
            paddingTop extra nella registrazione per dare aria al logo
        */}
        <ScrollView 
            contentContainerStyle={[
                styles.scrollContainer, 
                !isLogin && { justifyContent: 'flex-start', paddingTop: 60 } 
            ]}
        >
          
          <View style={styles.header}>
            <Image 
                source={require('./assets/logo.png')} 
                style={styles.logo} 
            />
            <Text style={styles.title}>{isLogin ? "Accedi" : "Crea Account"}</Text>
            <Text style={styles.subtitle}>Unisciti a Movie Group</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="francescopellecchia@qui.com" placeholderTextColor="#64748b" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"/>

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
                <TextInput 
                    style={styles.inputInside} 
                    placeholder="********" 
                    placeholderTextColor="#64748b" 
                    value={password} 
                    onChangeText={setPassword} 
                    secureTextEntry={!showPassword} 
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#64748b" />
                </TouchableOpacity>
            </View>

{/* TASTO PASSWORD DIMENTICATA (FIX UNIVERSALE WEB/APP) */}
            {isLogin && (
                <TouchableOpacity 
                    onPress={async () => {
                        // 1. CONTROLLO: Hai scritto l'email?
                        if(!email) { 
                            const msg = "Inserisci la tua email nel campo sopra prima di cliccare qui.";
                            
                            // BIVIO: Web o Telefono?
                            if (Platform.OS === 'web') alert("Manca Email: " + msg);
                            else Alert.alert("Manca Email", msg);
                            return; 
                        }

                        // 2. TENTATIVO DI INVIO
                        try {
                            await sendPasswordResetEmail(auth, email);
                            const successMsg = "Controlla la posta (e lo spam)! Ti abbiamo inviato il link per resettare la password.";
                            
                            // BIVIO: Web o Telefono?
                            if (Platform.OS === 'web') alert("📧 Fatto! " + successMsg);
                            else Alert.alert("📧 Fatto", successMsg);

                        } catch(e) { 
                            // GESTIONE ERRORI
                            const errorMsg = e.message;
                            if (Platform.OS === 'web') alert("Errore: " + errorMsg);
                            else Alert.alert("Errore", errorMsg); 
                        }
                    }} 
                    style={{alignSelf: 'flex-end', marginTop: 8, marginBottom: 10}}
                >
                    <Text style={{color: '#22d3ee', fontSize: 13, fontWeight:'bold'}}>Password dimenticata?</Text>
                </TouchableOpacity>
            )}

            {!isLogin && (
              <>
                <Text style={styles.label}>Nome</Text>
                <TextInput style={styles.input} placeholder="Es.TuoNome" placeholderTextColor="#64748b" value={firstName} onChangeText={setFirstName}/>
                <Text style={styles.label}>Cognome</Text>
                <TextInput style={styles.input} placeholder="Es.TuoCognome" placeholderTextColor="#64748b" value={lastName} onChangeText={setLastName}/>

                <Text style={styles.label}>Conferma Password</Text>
                <View style={styles.passwordContainer}>
                    <TextInput 
                        style={styles.inputInside} 
                        placeholder="********" 
                        placeholderTextColor="#64748b" 
                        value={confirmPassword} 
                        onChangeText={setConfirmPassword} 
                        secureTextEntry={!showPassword} 
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#64748b" />
                    </TouchableOpacity>
                </View>

                {/* SELETTORE RUOLO */}
                <View style={styles.switchContainer}>
                  <Text style={styles.switchLabel}>Registrati come: <Text style={{fontWeight:'bold', color:'#22d3ee'}}>{registrationRole}</Text></Text>
                  <TouchableOpacity
                    onPress={() => {
                        if(registrationRole === 'COLLABORATORE') setRegistrationRole('AMMINISTRATORE');
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

{/* --- CABINA DI COMANDO CONTATTI + FIRMA (FOOTER NUOVO) --- */}
            <View style={styles.footerContainer}>
              
              {/* 1. RIGA DELLE ICONE (Spostate in alto) */}
              <View style={styles.socialRow}>
                  {/* SITO WEB (Cyan) */}
                  <TouchableOpacity onPress={handleOpenWebsite} style={styles.contactBtn}>
                      <Feather name="globe" size={20} color="#22d3ee" />
                  </TouchableOpacity>

                  {/* EMAIL (Grigio) */}
                  <TouchableOpacity onPress={handleEmailSupport} style={styles.contactBtn}>
                      <Feather name="mail" size={20} color="#cbd5e1" />
                  </TouchableOpacity>
                  
                  {/* WHATSAPP (Verde) */}
                  <TouchableOpacity onPress={handleWhatsAppSupport} style={styles.contactBtn}>
                      <Feather name="message-circle" size={20} color="#22c55e" />
                  </TouchableOpacity>
              </View>

              {/* 2. LA TUA FIRMA (Il Tocco di Classe) */}
              <Text style={styles.creditText}>
                  Designed & Engineered by{'\n'}
                  <Text style={styles.creditName}>GUGLIELMI MASSIMO</Text>
              </Text>

            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// --- ROUTER PRINCIPALE (APP) ---
export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  // --- CARICAMENTO MANUALE ICONE (FIX PER WEB) ---
const [fontsLoaded] = useFonts({
    // Diciamo all'App di prendere il font direttamente dal Cloud
    Feather: 'https://unpkg.com/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf',
  });
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

// ... dentro export default function App() { ...

useEffect(() => {
  async function updateApp() {
    try {
      // Se sei in modalità sviluppo (npx expo start), non ricaricare
      if (__DEV__) return; 

      const update = await Updates.checkForUpdateAsync();
      
      if (update.isAvailable) {
        // Scarica i nuovi file dal server
        await Updates.fetchUpdateAsync();
        
        // Ricarica l'app istantaneamente per applicare le modifiche
        await Updates.reloadAsync();
      }
    } catch (e) {
      console.log("Errore Auto-Update:", e);
    }
  }

  updateApp();
}, []);

// 1. ASCOLTATORE AUTENTICAZIONE (PULITO)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        
        // Se l'utente non c'è (logout), puliamo tutto
        if (!user) {
            setUserRole(null);
            setLoadingApp(false);
            setScreenOverride(null);
        }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. ASCOLTATORE PROFILO UTENTE
  useEffect(() => {
    if (!currentUser) return;

    const userDocRef = doc(db, "users", currentUser.uid);
    const unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
        if (!docSnap.exists()) {
            signOut(auth);
            setUserRole(null);
            Alert.alert("Accesso Negato", "Il tuo account è stato rimosso o disabilitato.");
} else {
            const data = docSnap.data();
            
            // 1. CONTROLLO SOSPENSIONE (AGGIUNTO)
            if (data.isSuspended === true) {
                setUserRole("SUSPENDED"); 
            } 
            // 2. CONTROLLO APPROVAZIONE
            else if (data.isApproved === false) {
               setUserRole({ status: "PENDING_APPROVAL", originalRole: data.role });
            } 
            // 3. ACCESSO OK
            else {
               setUserRole(data.role);
               registerForPushNotificationsAsync(currentUser.uid);
            }
        }
        setLoadingApp(false);
    }, (error) => {
        console.error("Errore Snapshot:", error);
        setLoadingApp(false);
    });

    return () => unsubscribeSnapshot();
  }, [currentUser]);


  // --- RENDERING ---
  if (showIntro) {
  return <AvvioApp onFinish={() => setShowIntro(false)} />;
}

  if (loadingApp) return <View style={[styles.container, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color="#06b6d4"/></View>;
  if (!currentUser) return <AuthScreen />;
// --- SCHERMATA ACCESSO SOSPESO ---
  if (userRole === "SUSPENDED") {
      return (
          <View style={{flex:1, backgroundColor:'#000', justifyContent:'center', alignItems:'center', padding:30}}>
              <StatusBar barStyle="light-content" backgroundColor="#000"/>
              <Feather name="lock" size={80} color="#FF9500" style={{marginBottom:30}} />
              <Text style={{color:'#FFF', fontSize:24, fontWeight:'900', textAlign:'center', marginBottom:15}}>ACCESSO SOSPESO</Text>
              <Text style={{color:'#8E8E93', fontSize:16, textAlign:'center', marginBottom:40, lineHeight:24}}>
                  Il tuo account è stato momentaneamente congelato (Pausa Stagionale/Amministrativa).{'\n'}
                  Contatta l'amministrazione per riattivarlo.
              </Text>
              <TouchableOpacity onPress={() => signOut(auth)} style={styles.buttonRed}>
                  <Text style={styles.buttonText}>ESCI</Text>
              </TouchableOpacity>
          </View>
      );
  }
  if (userRole && typeof userRole === 'object' && userRole.status === "PENDING_APPROVAL") {
      return <PendingApprovalScreen userRole={userRole.originalRole} />;
  }

  // --- GESTIONE SCHERMATE ---
  if (screenOverride === 'TurnoDimenticato') return <TurnoDimenticato navigation={{ goBack: handleGoBack }} route={{ params: shiftCreationParams }} />;
  if (screenOverride === 'PDFDelFounder') return <PDFDelFounder navigation={{ goBack: handleGoBack }} />;
  if (screenOverride === 'Board') return <MostroRivoluzionario navigation={{ goBack: handleGoBack }} />;
  if (screenOverride === 'CreateShiftScreen') return <CreateShiftScreen navigation={{ goBack: handleGoBack }} route={{ params: shiftCreationParams }} />;
  if (screenOverride === 'ModificaTurno') return <ModificaTurno navigation={{ goBack: handleGoBack }} route={{ params: shiftCreationParams }} />;
  if (screenOverride === 'AdminStaffScreen') return <AdminStaffScreen navigation={{ goBack: handleGoBack }} route={{ params: shiftCreationParams }} />;
  if (screenOverride === 'ShiftManagementScreen') return <ShiftManagementScreen navigation={{ goBack: handleGoBack, navigate: handleNavigate }} route={{ params: shiftCreationParams }} />;
  if (screenOverride === 'CamerinoStaff') return <CamerinoStaff navigation={{ goBack: handleGoBack }} />;
  if (screenOverride === 'StoricoFounder') return <StoricoFounder navigation={{ goBack: handleGoBack }} />;

  // HOME PAGE
  if (userRole === "FOUNDER") return <FounderHome navigation={{ navigate: handleNavigate }} />;
  if (userRole === "AMMINISTRATORE") return <AdminHome navigation={{ navigate: handleNavigate }} />;

  if (userRole === "COLLABORATORE") {
    if (screenOverride === 'CollaboratorHistory') return <CollaboratorHistoryScreen onBack={() => setScreenOverride(null)} />;
    if (screenOverride === 'CamerinoStaff') return <CamerinoStaff navigation={{ goBack: () => setScreenOverride(null) }} />;
    if (screenOverride === 'Board') return <MostroRivoluzionario navigation={{ goBack: () => setScreenOverride(null) }} />;

    return (
        <CollaboratorHome
            onNavigateHistory={() => setScreenOverride('CollaboratorHistory')}
            onNavigateProfile={() => setScreenOverride('CamerinoStaff')}
            onNavigateBoard={() => setScreenOverride('Board')}
        />
    );
  }

  return <CollaboratorHome onNavigateHistory={() => setScreenOverride('CollaboratorHistory')} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#ffffffff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#94a3b8' },
  form: { width: '100%' },
  label: { color: '#cbd5e1', marginBottom: 8, fontSize: 14, marginLeft: 4 },
  input: { backgroundColor: '#1e293b', color: '#ffffff', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, marginBottom: 20, fontSize: 16, borderWidth: 1, borderColor: '#334155' },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 30, borderWidth: 1, borderColor: '#334155' },
  switchLabel: { color: '#ffffff', fontSize: 14, flex: 1 },
  button: { backgroundColor: '#06b6d4', paddingVertical: 16, borderRadius: 12, alignItems: 'center', shadowColor: '#22d3ee', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  linkButton: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#94a3b8', fontSize: 14 },
  companyInfo: { marginTop: 40, alignItems: 'center', paddingBottom: 20 },
  companyInfoText: { color: '#64748b', fontSize: 12, marginTop: 2 }, 
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 20, paddingHorizontal: 16 },
  inputInside: { flex: 1, color: '#ffffff', fontSize: 16, paddingVertical: 14 },
  logo: {width: 250,height: 100,resizeMode: 'contain',marginBottom: 20,},
  contactBtn: {padding: 12,backgroundColor: '#1e293b',borderRadius: 50,borderWidth: 1,borderColor: '#334155'},
  footerContainer: {marginTop: 40,alignItems: 'center',paddingBottom: 30,width: '100%',},
  socialRow: {flexDirection: 'row',justifyContent: 'center',gap: 20,marginBottom: 20,},
  creditText: {color: '#6e6e73',fontSize: 10,textTransform: 'uppercase',letterSpacing: 1.5,textAlign: 'center',lineHeight: 16,},
  creditName: {color: '#FFFFFF',fontWeight: '900',fontSize: 11,},
  buttonRed: { backgroundColor: '#ef4444', padding: 9, borderRadius: 8, alignItems: 'center', width:'40%' },
});
