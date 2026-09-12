const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Vercel Serverless Function
module.exports = async (req, res) => {
  try {
    // 1. Validate environment
    const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
    const alertEmail = (process.env.ALERT_EMAIL || 'auxiliarsst.nuevosantander@lis.com.co').trim();
    const emailFrom = (process.env.EMAIL_FROM || 'Alertas CEDI <onboarding@resend.dev>').trim();
    const isTestMode = req.query.test === 'true';

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // 2. Fetch all vehicles and alerts
    const { data: vehicles, error: vError } = await supabase.from('vehiculos').select('*');
    if (vError) throw vError;

    const { data: pastAlerts, error: aError } = await supabase.from('document_alerts').select('*');
    if (aError) throw aError;

    const pastAlertsSet = new Set(
      pastAlerts.map(a => `${a.vehicle_id}_${a.document_type}_${a.alert_type}`)
    );

    // 3. Compute current date in Bogota
    // Using a simple trick to get a Date object representing midnight in Bogota
    const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Bogota" });
    const bogotaToday = new Date(nowStr);
    bogotaToday.setHours(0, 0, 0, 0);

    const alertsToSend = [];
    const logs = [];

    const calculateDaysLeft = (targetDateStr) => {
      if (!targetDateStr) return null;
      // targetDateStr format is usually YYYY-MM-DD
      const parts = targetDateStr.split('-');
      if (parts.length !== 3) return null;
      // create Date in local timezone (effectively acting as UTC noon to avoid timezone shift)
      const targetDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
      
      const today12 = new Date(bogotaToday);
      today12.setHours(12, 0, 0, 0);

      const diffTime = targetDate - today12;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const determineAlertType = (days) => {
      if (days < 0) return 'expired';
      if (days === 1) return '1_day';
      if (days > 1 && days <= 7) return '7_days';
      if (days > 7 && days <= 15) return '15_days';
      if (days > 15 && days <= 30) return '30_days';
      return null;
    };

    // 4. Analyze each document
    for (const v of vehicles) {
      const docs = [
        { type: 'SOAT', date: v.soat_vencimiento },
        { type: 'RTM', date: v.rtm_vencimiento },
        { type: 'LICENCIA', date: v.licencia_vencimiento }
      ];

      for (const doc of docs) {
        if (!doc.date || doc.date === 'N/A') continue;
        
        const daysLeft = calculateDaysLeft(doc.date);
        if (daysLeft === null) continue;

        const alertType = determineAlertType(daysLeft);
        if (!alertType) continue; // More than 30 days, no alert

        const alertKey = `${v.id}_${doc.type}_${alertType}`;
        if (!pastAlertsSet.has(alertKey)) {
          // We need to send this alert!
          alertsToSend.push({
            vehicle: v,
            document_type: doc.type,
            alert_type: alertType,
            days_left: daysLeft,
            expiration_date: doc.date
          });
          // Optimistically add to set to prevent duplicates in same run if any
          pastAlertsSet.add(alertKey);
        } else {
          logs.push(`Already sent: ${alertKey}`);
        }
      }
    }

    // 5. Build and send emails
    let emailsSentCount = 0;
    let errorsCount = 0;

    for (const alert of alertsToSend) {
      const v = alert.vehicle;
      const dType = alert.document_type;
      
      let subject = '';
      let emoji = '';
      let daysText = alert.days_left < 0 
        ? `Lleva ${Math.abs(alert.days_left)} días vencido` 
        : `Faltan ${alert.days_left} días`;

      switch(alert.alert_type) {
        case '30_days': subject = `⚠️ Documento próximo a vencer - 30 días (${dType})`; emoji = '🟡'; break;
        case '15_days': subject = `⚠️ Documento próximo a vencer - 15 días (${dType})`; emoji = '🟠'; break;
        case '7_days': subject = `🔴 ALERTA DOCUMENTAL - VENCE EN 7 DÍAS (${dType})`; emoji = '🔴'; break;
        case '1_day': subject = `🚨 ALERTA URGENTE - DOCUMENTO VENCE MAÑANA (${dType})`; emoji = '🚨'; break;
        case 'expired': subject = `⛔ DOCUMENTO VENCIDO - REQUIERE RENOVACIÓN (${dType})`; emoji = '⛔'; break;
      }

      const htmlBody = `
        <h2>${emoji} ALERTA DE VENCIMIENTO DOCUMENTAL</h2>
        <p>Se informa el estado actual del siguiente documento:</p>
        <ul>
          <li><strong>Persona/Propietario:</strong> ${v.nombre}</li>
          <li><strong>Vehículo (Placa):</strong> ${v.placa} (${v.tipo_vehiculo})</li>
          <li><strong>Empresa:</strong> ${v.empresa || 'CEDI'}</li>
          <li><strong>Documento:</strong> ${dType}</li>
          <li><strong>Fecha de vencimiento:</strong> ${alert.expiration_date}</li>
          <li><strong>Estado:</strong> ${daysText}</li>
        </ul>
        <p><em>Por favor gestione oportunamente la renovación o bloqueo de este registro en el sistema.</em></p>
      `;

      let sendError = null;

      if (!isTestMode) {
        if (resend) {
          try {
            const { error } = await resend.emails.send({
              from: emailFrom,
              to: alertEmail,
              subject: `[${v.placa}] ${subject}`,
              html: htmlBody
            });
            if (error) sendError = error.message;
          } catch (e) {
            sendError = e.message;
          }
        } else {
          sendError = 'RESEND_API_KEY not configured';
        }

        // Insert log in Supabase
        await supabase.from('document_alerts').insert({
          vehicle_id: v.id,
          document_type: dType,
          alert_type: alert.alert_type,
          recipient_email: alertEmail,
          status: sendError ? 'error' : 'sent',
          error_message: sendError
        });
      }

      if (sendError) {
        errorsCount++;
        logs.push(`Error sending ${v.placa} ${dType}: ${sendError}`);
      } else {
        emailsSentCount++;
        logs.push(`Sent ${alert.alert_type} alert for ${v.placa} (${dType}) to ${alertEmail}`);
      }
    }

    const resultSummary = {
      message: 'Ejecución completada',
      isTestMode,
      documentsChecked: vehicles.length * 3,
      alertsTriggered: alertsToSend.length,
      emailsSent: emailsSentCount,
      errors: errorsCount,
      alreadySent: logs.filter(l => l.startsWith('Already sent')).length,
      logs: logs,
      simulatedAlerts: isTestMode ? alertsToSend.map(a => {
        let subject = '';
        switch(a.alert_type) {
          case '30_days': subject = `⚠️ Documento próximo a vencer - 30 días (${a.document_type})`; break;
          case '15_days': subject = `⚠️ Documento próximo a vencer - 15 días (${a.document_type})`; break;
          case '7_days': subject = `🔴 ALERTA DOCUMENTAL - VENCE EN 7 DÍAS (${a.document_type})`; break;
          case '1_day': subject = `🚨 ALERTA URGENTE - DOCUMENTO VENCE MAÑANA (${a.document_type})`; break;
          case 'expired': subject = `⛔ DOCUMENTO VENCIDO - REQUIERE RENOVACIÓN (${a.document_type})`; break;
        }
        return {
          placa: a.vehicle.placa,
          document_type: a.document_type,
          expiration_date: a.expiration_date,
          days_left: a.days_left,
          alert_type: a.alert_type,
          recipient: alertEmail,
          subject: subject
        };
      }) : []
    };

    console.log('[DOCUMENT ALERTS] Summary:', resultSummary);
    return res.status(200).json(resultSummary);

  } catch (error) {
    console.error('Fatal error in cron-check-expirations:', error);
    return res.status(500).json({ error: error.message });
  }
};
