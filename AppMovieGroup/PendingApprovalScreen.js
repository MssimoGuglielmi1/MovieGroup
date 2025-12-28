//PendingApprovalScreen.js
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator, StatusBar, TouchableOpacity } from 'react-native';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, getDoc } from 'firebase/firestore'; 
import { auth, db } from './firebaseConfig'; 

const PendingApprovalScreen = ({ userRole }) => {
    
    // Testo dinamico per il ruolo
    let approverText = "del Founder";
    if (userRole === "COLLABORATORE") {
        approverText = "di un Amministratore";
    }

    const handleSignOut = () => {
        signOut(auth).catch((error) => console.error("Errore disconnessione:", error));
    };

    // --- IL MARTELLO PNEUMATICO (Check Automatico Continuo) ---
    useEffect(() => {
        const checkVerificationLoop = async () => {
            const user = auth.currentUser;
            if (!user) return; // Se l'utente non c'è, ferma tutto

            try {
                // 1. Chiediamo a Google: "È verificato ORA?"
                await user.reload();
                const updatedUser = auth.currentUser;

                // 2. SE È VERIFICATO SU GOOGLE...
                if (updatedUser && updatedUser.emailVerified) {
                    
                    // ...Controlliamo il database per vedere se è ancora false
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);
                    
                    // Se nel DB è false o manca...
                    if (userSnap.exists() && userSnap.data().emailVerified !== true) {
                        // 3. SCRIVIAMO TRUE NEL DATABASE!
                        await updateDoc(userRef, { emailVerified: true });
                        console.log("✅ BINGO! Database aggiornato a TRUE.");
                    }
                }
            } catch (e) {
                // Se c'è un errore di rete momentaneo, ignora e riprova al prossimo giro
                console.log("Check loop...", e.message);
            }
        };

        // Esegui il controllo OGNI 3 SECONDI (3000 ms)
        const intervalId = setInterval(checkVerificationLoop, 3000);

        // Pulizia quando si chiude la schermata
        return () => clearInterval(intervalId);
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
            <View style={styles.content}>

                <ActivityIndicator size="large" color="#06b6d4" style={styles.indicator} />

                <Text style={styles.title}>Registrazione Completata!</Text>
                
                <Text style={styles.subtitle}>
                    Il tuo account è stato creato, ma è in attesa di approvazione da parte {approverText}.
                </Text>

                <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                        📩 Ti abbiamo inviato una mail. Clicca il link di verifica e attendi qualche secondo in questa schermata.
                    </Text>
                    <Text style={{color: '#94a3b8', fontSize: 12, marginTop: 10, fontStyle:'italic'}}>
                        (Il sistema si aggiornerà automaticamente...)
                    </Text>
                </View>

                <Text style={styles.footerText}>
                    Riceverai una notifica non appena potrai accedere.
                </Text>

                <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
                    <Text style={styles.logoutText}>Esci</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    indicator: { marginBottom: 30 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 16, color: '#94a3b8', marginBottom: 30, textAlign: 'center' },
    
    infoBox: {
        backgroundColor: 'rgba(6, 182, 212, 0.1)', 
        padding: 20, 
        borderRadius: 16, 
        marginBottom: 30, 
        borderWidth: 1, 
        borderColor: '#06b6d4',
        width: '100%',
        alignItems: 'center'
    },
    infoText: { color: '#22d3ee', fontSize: 14, textAlign: 'center', fontWeight: 'bold' },

    footerText: { fontSize: 14, color: '#64748b', marginBottom: 20, textAlign: 'center' },
    
    logoutButton: {
        marginTop: 20,
        paddingVertical: 10,
        paddingHorizontal: 30,
        borderRadius: 12,
        backgroundColor: '#ef4444'
    },
    logoutText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});

export default PendingApprovalScreen;
