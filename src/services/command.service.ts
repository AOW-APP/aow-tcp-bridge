import { supabase } from '../supabase.ts';
import { sessionStore } from '../tcp/sessionStore.ts';

export class CommandService {
  /**
   * Fetches and processes pending commands for a device from the database queue
   */
  public static async processPendingCommands(imei: string) {
    try {
      const { data: commands, error } = await supabase
        .from('device_commands')
        .select('id, command, payload')
        .eq('imei', imei)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!commands || commands.length === 0) return;

      console.log(`[Commands Queue] Found ${commands.length} pending commands for device ${imei}. Processing...`);

      for (const cmd of commands) {
        const commandContent = cmd.payload ? `${cmd.command},${cmd.payload}` : cmd.command;
        const sent = sessionStore.sendCommand(imei, commandContent);

        if (sent) {
          const { error: updateErr } = await supabase
            .from('device_commands')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', cmd.id);

          if (updateErr) {
            console.error(`[Commands Queue] Error updating status for command ID ${cmd.id}:`, updateErr.message);
          } else {
            console.log(`[Commands Queue] Sent pending command '${commandContent}' (ID: ${cmd.id}) to device ${imei}.`);
          }
        } else {
          console.warn(`[Commands Queue] Failed to write command ${cmd.id} to socket (device disconnected during process).`);
          break; // Stop queue processing if connection drops
        }
      }
    } catch (err: any) {
      console.error(`[Commands Queue] Error processing pending commands for IMEI ${imei}:`, err.message);
    }
  }

  /**
   * Registers that a command was acknowledged by the device.
   */
  public static async acknowledgeCommand(imei: string, commandType: string) {
    try {
      const { error } = await supabase
        .from('device_commands')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('imei', imei)
        .eq('command', commandType)
        .is('acknowledged_at', null);

      if (error) throw error;
      console.log(`[Commands] Acknowledgment updated for command '${commandType}' on device ${imei}.`);
    } catch (err: any) {
      console.error(`[DB Error] Failed to update acknowledgment for command ${commandType}:`, err.message);
    }
  }
}
