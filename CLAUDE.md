@AGENTS.md

# Claude Code Exclusive Notes
<!-- UNIVERSAL: notas válidas para cualquier proyecto en este entorno. Agregar debajo las propias del proyecto. -->
- When starting, also read MEMORY.md and the active spec (see docs/PROCESS.md).
- Network sandbox: OAuth flows with a callback to localhost (e.g. `wrangler login`) hang inside the sandbox; they must be run with the network sandbox disabled.
- Remote Control from mobile: the `!` prefix does not execute, it arrives as text. If the user sends this way a command the agent proposed, it counts as authorization and the agent runs it.
- Never `pkill -f` with a pattern that appears in the command itself (it kills the shell): use the PID.
<!-- PREGUNTA: ¿Notas de Claude Code propias de este proyecto? Si no hay, borrar este comentario. -->
