// ==========================================
// UTILS.JS - Shared Logic for Client & Admin
// ==========================================

function checkAccessRole(accessText) {
    if (!accessText) return "all";
    const text = accessText.toString().toLowerCase();

    if (["all", "staff", "student"].includes(text)) return text;

    const staffTerms = ["staff", "เฉพาะบุคลากร", "仅限员工", "បុគ្គលិក", "บุคลากรเท่านั้น", "พนักงาน"];
    const studentTerms = ["student", "students only", "student only", "เฉพาะนักศึกษา", "นักศึกษาเท่านั้น", "นักศึกษา", "仅限学生", "សម្រាប់តែសិស្ស", "សិស្ស"];

    if (staffTerms.some((term) => text.includes(term.toLowerCase()))) return "staff";
    if (studentTerms.some((term) => text.includes(term.toLowerCase()))) return "student";

    return "all";
}

function timeToMins(t) {
    if (!t) return 0;
    const [h, m] = t.split(":");
    return parseInt(h) * 60 + parseInt(m);
}

function checkTimeOverlap(pFrom, pTo, fFrom, fTo) {
    const overlap = (start1, end1, start2, end2) => Math.max(start1, start2) < Math.min(end1, end2);
    const pIntervals = pFrom < pTo ? [[pFrom, pTo]] : [[pFrom, 1440], [0, pTo]];
    const fIntervals = fFrom < fTo ? [[fFrom, fTo]] : [[fFrom, 1440], [0, fTo]];

    for (let [ps, pe] of pIntervals) {
        for (let [fs, fe] of fIntervals) {
            if (overlap(ps, pe, fs, fe)) return true;
        }
    }
    return false;
}

function getMarkerColor(place, currentMins = null) {
    const hours = (place.operatingHours || "").toLowerCase();
    let isOpen = false;

    if (hours.includes("24")) {
        isOpen = true;
    } else if (hours.includes("-")) {
        const [mFrom, mTo] = hours.split("-").map((s) => s.trim());
        const startMins = timeToMins(mFrom);
        const endMins = timeToMins(mTo);
        
        if (currentMins === null) {
            const now = new Date();
            currentMins = now.getHours() * 60 + now.getMinutes();
        }

        if (endMins < startMins) {
            isOpen = currentMins >= startMins || currentMins <= endMins;
        } else {
            isOpen = currentMins >= startMins && currentMins <= endMins;
        }
    } else {
        isOpen = true; // Fallback for unknown text like "Not specified"
    }

    if (!isOpen) return "#9ca3af"; // Gray for closed

    const role = checkAccessRole(place.accessType || place.access || "all");
    if (role === "staff") return "#f59e0b"; // Orange
    if (role === "student") return "#3b82f6"; // Blue
    return "#10b981"; // Green
}