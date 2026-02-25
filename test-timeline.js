const pEvents = [
  { time: Date.parse("2/12/2026, 7:13:33 PM") / 1000, state: -1 }, // Start -1
  { time: Date.parse("2/21/2026, 7:42:04 PM") / 1000, state: -1 }, 
  { time: Date.parse("2/21/2026, 7:48:40 PM") / 1000, state: 1 }, // On less than 2 mins
  { time: Date.parse("2/21/2026, 7:48:43 PM") / 1000, state: -1 }, 
  { time: Date.parse("2/21/2026, 7:54:39 PM") / 1000, state: 1 }, 
  { time: Date.parse("2/21/2026, 7:54:43 PM") / 1000, state: -1 },
  { time: Date.parse("2/21/2026, 8:17:06 PM") / 1000, state: 1 } // Finally stable ON
];

var CleanEvents = [];
var previousPower = null;
for (var i = 0; i < pEvents.length; i++) {
    var curr = pEvents[i];
    
    if (CleanEvents.length === 0) { 
        if (curr.state === 0) continue;
        CleanEvents.push(curr);
        previousPower = curr.state;
    } else if (previousPower !== curr.state) {
        // Only skip if the NEXT event exists and fires within 120s
        var isShort = (i + 1 < pEvents.length) && ((pEvents[i + 1].time - curr.time) < 120);
        
        if (isShort) {
             // We skip pushing this state. Core *does* set previousPower but DOES NOT append the time chunk. 
             // We need to keep our `CleanEvents` timeline contiguous. If we skip, the current state in reality just stays the old state.
             previousPower = curr.state;
             continue;
        }

        // If the intended state is identical to the last pushed state, skip pushing to avoid duplicates
        if (CleanEvents[CleanEvents.length - 1].state !== curr.state) {
             CleanEvents.push(curr);
        }
        previousPower = curr.state;
    } else {
        // Native MeshCentral advances loop doing previousPower = curr.state;
        previousPower = curr.state;
    }
}
// One final coalescence run to ensure no back-to-back duplicates slipped in if a flip-flop landed on identical flanking states
var FinalEvents = [];
for (var i = 0; i < CleanEvents.length; i++) {
    if (FinalEvents.length > 0 && FinalEvents[FinalEvents.length - 1].state === CleanEvents[i].state) {
        continue;
    }
    FinalEvents.push(CleanEvents[i]);
}

console.log("Original: ", pEvents.length, "Final: ", FinalEvents.length);
console.log(FinalEvents);
