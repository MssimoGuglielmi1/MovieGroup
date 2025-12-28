import React, { useState, useEffect } from 'react';
import { View, Text, Image, StatusBar } from 'react-native';

export default function AvvioApp({ onFinish }) {
  const [loadingPercentage, setLoadingPercentage] = useState(0);

  // LOGICA SIMULAZIONE CARICAMENTO
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingPercentage((prev) => {
        // Se siamo arrivati a 100, diciamo ad App.js che abbiamo finito
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
             onFinish(); // <--- QUESTO COMANDO SBLOCCA L'APP
          }, 500); // Aspetta mezzo secondo a 100% prima di chiudere
          return 100;
        }
        // Aggiungi numero casuale
        const jump = Math.floor(Math.random() * 5) + 1;
        return Math.min(prev + jump, 100);
      });
    }, 100); // Velocità caricamento (più basso = più veloce)

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ 
      flex: 1, 
      backgroundColor: '#0f172a', // Sfondo Uguale al Login (Blu Scuro)
      justifyContent: 'center', 
      alignItems: 'center',
      padding: 20
    }}>
      <StatusBar hidden={true} />
      
      {/* LOGO */}
      <Image 
        source={require('./assets/logo.png')}
        style={{ 
          width: '85%',       
          height: 250,        
          resizeMode: 'contain',
          marginBottom: 60    
        }} 
      />

      {/* BARRA DI CARICAMENTO */}
      <View style={{ width: '100%', maxWidth: 400, alignItems: 'center' }}>
          <Text style={{ 
            color: '#ffffff', 
            fontSize: 14, 
            fontWeight: 'bold', 
            marginBottom: 10, 
            opacity: 0.8,
            letterSpacing: 2
          }}>
              CARICAMENTO... {loadingPercentage}%
          </Text>

          {/* Sfondo Barra */}
          <View style={{ 
            width: '100%', 
            height: 4, 
            backgroundColor: '#334155', // Grigio Bluastro
            borderRadius: 2, 
            overflow: 'hidden' 
          }}>
              {/* Barra Piena (Azzurro MovieGroup) */}
              <View style={{ 
                  width: `${loadingPercentage}%`, 
                  height: '100%', 
                  backgroundColor: '#ffffffff', // Ciano
                  borderRadius: 2
              }} />
          </View>
      </View>
    </View>
  );
}