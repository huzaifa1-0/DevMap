from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

OUTPUT = "u:\\DevMap\\DevMap_V2_Groq_Plan.pdf"

# ── Palette ──────────────────────────────────────────────────────────────────
C_DARK    = colors.HexColor("#0D0D1A")
C_GROQ    = colors.HexColor("#F55036")   # Groq brand-ish orange-red
C_BLUE    = colors.HexColor("#185FA5")
C_TEAL    = colors.HexColor("#0F6E56")
C_PURPLE  = colors.HexColor("#534AB7")
C_AMBER   = colors.HexColor("#BA7517")
C_CORAL   = colors.HexColor("#993C1D")
C_INDIGO  = colors.HexColor("#2B3A8F")
C_LIGHT   = colors.HexColor("#F4F2EC")
C_MID     = colors.HexColor("#D3D1C7")
C_WHITE   = colors.white
C_BODY    = colors.HexColor("#2C2C2A")
C_MUTED   = colors.HexColor("#888780")

def S(name, **kw):
    return ParagraphStyle(name, **kw)

cover_title = S("ct", fontName="Helvetica-Bold", fontSize=34, textColor=C_WHITE,   leading=42, alignment=TA_CENTER)
cover_v     = S("cv", fontName="Helvetica-Bold", fontSize=13, textColor=C_GROQ,    leading=18, alignment=TA_CENTER)
cover_sub   = S("cs", fontName="Helvetica",      fontSize=13, textColor=colors.HexColor("#B5D4F4"), leading=20, alignment=TA_CENTER)
cover_meta  = S("cm", fontName="Helvetica",      fontSize=9,  textColor=C_MUTED,   leading=13, alignment=TA_CENTER)

h1   = S("h1",   fontName="Helvetica-Bold", fontSize=17, textColor=C_GROQ,   leading=22, spaceBefore=16, spaceAfter=5)
h2   = S("h2",   fontName="Helvetica-Bold", fontSize=13, textColor=C_DARK,   leading=18, spaceBefore=12, spaceAfter=4)
h3   = S("h3",   fontName="Helvetica-Bold", fontSize=10, textColor=C_TEAL,   leading=14, spaceBefore=8,  spaceAfter=3)
body = S("body", fontName="Helvetica",      fontSize=10, textColor=C_BODY,   leading=16, spaceAfter=4)
bul  = S("bul",  fontName="Helvetica",      fontSize=10, textColor=C_BODY,   leading=15, leftIndent=14,  spaceAfter=3)
code = S("code", fontName="Courier",        fontSize=8,  textColor=colors.HexColor("#1A1060"),
         leading=13, backColor=colors.HexColor("#EEEDFE"), leftIndent=10, rightIndent=10,
         spaceBefore=3, spaceAfter=3)
note = S("note", fontName="Helvetica-Oblique", fontSize=9, textColor=C_MUTED, leading=13, leftIndent=10, spaceAfter=5)

def hr(color=C_MID, t=0.5):
    return HRFlowable(width="100%", thickness=t, color=color, spaceAfter=5, spaceBefore=5)

def phase_bar(num, title, subtitle, color):
    data = [[
        Paragraph(f"Phase {num}", S("pn", fontName="Helvetica-Bold", fontSize=10, textColor=C_WHITE, leading=13, alignment=TA_CENTER)),
        Paragraph(f"<b>{title}</b><br/><font size='8' color='#D3D1C7'>{subtitle}</font>",
                  S("pt", fontName="Helvetica-Bold", fontSize=13, textColor=C_WHITE, leading=17))
    ]]
    t = Table(data, colWidths=[26*mm, 132*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), color),
        ("ALIGN",         (0,0),(0,0),   "CENTER"),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0),(-1,-1),  8),
        ("BOTTOMPADDING", (0,0),(-1,-1),  8),
        ("LEFTPADDING",   (0,0),(0,0),    4),
        ("LEFTPADDING",   (1,0),(1,0),   10),
    ]))
    return t

def steps(rows, accent):
    data = [[
        Paragraph(f"<b>{r[0]}</b>", S("sl", fontName="Helvetica-Bold", fontSize=9, textColor=accent, leading=13)),
        Paragraph(r[1], S("sd", fontName="Helvetica", fontSize=9, textColor=C_BODY, leading=14))
    ] for r in rows]
    t = Table(data, colWidths=[38*mm, 120*mm])
    t.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",    (0,0),(-1,-1),  5),
        ("BOTTOMPADDING", (0,0),(-1,-1),  5),
        ("LEFTPADDING",   (0,0),(-1,-1),  8),
        ("LINEBELOW",     (0,0),(-1,-2),  0.3, C_MID),
        ("BACKGROUND",    (0,0),(0,-1),   C_LIGHT),
        ("ROWBACKGROUNDS",(1,0),(1,-1),   [C_WHITE, colors.HexColor("#FAFAF8")]),
    ]))
    return t

def two_col(left_items, right_items, l_accent, r_accent, l_head, r_head):
    def cell_para(items, accent):
        return "\n".join([f"• {i}" for i in items])
    data = [[
        Paragraph(f"<b>{l_head}</b>", S("ch", fontName="Helvetica-Bold", fontSize=9, textColor=C_WHITE, leading=13, alignment=TA_CENTER)),
        Paragraph(f"<b>{r_head}</b>", S("ch2", fontName="Helvetica-Bold", fontSize=9, textColor=C_WHITE, leading=13, alignment=TA_CENTER)),
    ]]
    # item rows
    max_len = max(len(left_items), len(right_items))
    for i in range(max_len):
        l = left_items[i]  if i < len(left_items)  else ""
        r = right_items[i] if i < len(right_items) else ""
        data.append([
            Paragraph(f"• {l}" if l else "", S("ci", fontName="Helvetica", fontSize=9, textColor=C_BODY, leading=14)),
            Paragraph(f"• {r}" if r else "", S("ci2", fontName="Helvetica", fontSize=9, textColor=C_BODY, leading=14)),
        ])
    t = Table(data, colWidths=[79*mm, 79*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(0,0),   l_accent),
        ("BACKGROUND",    (1,0),(1,0),   r_accent),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, C_LIGHT]),
        ("GRID",          (0,0),(-1,-1), 0.3, C_MID),
        ("TOPPADDING",    (0,0),(-1,-1),  5),
        ("BOTTOMPADDING", (0,0),(-1,-1),  5),
        ("LEFTPADDING",   (0,0),(-1,-1),  8),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    return t

def info_box(text, bg, fg=None):
    fg = fg or C_BODY
    data = [[Paragraph(text, S("ib", fontName="Helvetica", fontSize=9, textColor=fg, leading=14))]]
    t = Table(data, colWidths=[158*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), bg),
        ("TOPPADDING",    (0,0),(-1,-1),  8),
        ("BOTTOMPADDING", (0,0),(-1,-1),  8),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
        ("RIGHTPADDING",  (0,0),(-1,-1), 10),
    ]))
    return t

# ── Build doc ────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=18*mm, rightMargin=18*mm,
    topMargin=16*mm,  bottomMargin=16*mm,
    title="DevMap V2 – Groq AI Integration Plan",
    author="AI Engineer Roadmap"
)

story = []

# ── Cover ─────────────────────────────────────────────────────────────────────
def draw_cover(canvas, doc):
    w, h = A4
    canvas.saveState()
    canvas.setFillColor(C_DARK)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    # groq accent stripe
    canvas.setFillColor(C_GROQ)
    canvas.rect(0, h*0.37, w, 5, fill=1, stroke=0)
    canvas.setFillColor(C_PURPLE)
    canvas.rect(0, h*0.37-8, w, 4, fill=1, stroke=0)
    canvas.restoreState()

story.append(Spacer(1, 44*mm))
story.append(Paragraph("DevMap V2", cover_title))
story.append(Spacer(1, 3*mm))
story.append(Paragraph("⚡ Powered by Groq AI", cover_v))
story.append(Spacer(1, 6*mm))
story.append(Paragraph("Complete Implementation Plan", cover_sub))
story.append(Spacer(1, 5*mm))
story.append(Paragraph(
    "Explain topics from your code · Quiz mode · Smart next-topic suggestions<br/>"
    "Live in both VS Code sidebar and the web dashboard", cover_sub))
story.append(Spacer(1, 14*mm))
story.append(Paragraph("Stack: TypeScript · VS Code API · Groq SDK · llama3-70b-8192", cover_meta))
story.append(Paragraph("Builds on top of: DevMap V1 (AST scanner + TreeView + WebviewPanel)", cover_meta))
story.append(Spacer(1, 76*mm))

# ── Page 2 – What changes in V2 ───────────────────────────────────────────────
story.append(Paragraph("What Changes in V2?", h1))
story.append(hr(C_GROQ, 1))
story.append(Paragraph(
    "V1 already scans your code and shows which topics you have covered. "
    "V2 adds a Groq AI layer on top — so DevMap doesn't just track what you used, "
    "it explains it in context of your own code, quizzes you on it, and tells you "
    "what to learn next. The AI responses appear both in VS Code (hover + sidebar) "
    "and in the web dashboard.", body))
story.append(Spacer(1, 4*mm))

delta_data = [
    ["Feature",                  "V1",        "V2 (Groq added)"],
    ["Topic detection",          "✓ Done",    "✓ Same — unchanged"],
    ["Sidebar TreeView",         "✓ Done",    "✓ + Explain button per topic"],
    ["Web dashboard",            "✓ Done",    "✓ + AI panel (explain/quiz/suggest)"],
    ["Topic explanation",        "—",         "✓ Groq explains from YOUR code"],
    ["Quiz mode",                "—",         "✓ Groq generates Q&A per topic"],
    ["Next topic suggestions",   "—",         "✓ Groq picks what to learn next"],
    ["Code snippet context",     "—",         "✓ Actual lines sent to Groq"],
    ["Groq API key management",  "—",         "✓ VS Code SecretStorage"],
    ["Streaming responses",      "—",         "✓ Typewriter effect in dashboard"],
]
dt = Table(delta_data, colWidths=[68*mm, 28*mm, 62*mm])
dt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0),  C_GROQ),
    ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
    ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
    ("FONTSIZE",      (0,0),(-1,-1),  9),
    ("FONTNAME",      (0,1),(-1,-1), "Helvetica"),
    ("TEXTCOLOR",     (0,1),(-1,-1), C_BODY),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, C_LIGHT]),
    ("GRID",          (0,0),(-1,-1),  0.3, C_MID),
    ("TOPPADDING",    (0,0),(-1,-1),  5),
    ("BOTTOMPADDING", (0,0),(-1,-1),  5),
    ("LEFTPADDING",   (0,0),(-1,-1),  8),
    ("ALIGN",         (1,1),(-1,-1), "CENTER"),
    ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ("TEXTCOLOR",     (1,2),(1,-1),   C_TEAL),
    ("FONTNAME",      (1,2),(1,-1),  "Helvetica"),
]))
story.append(dt)
story.append(Spacer(1, 4*mm))
story.append(info_box(
    "Why Groq? Groq runs llama3-70b-8192 at ~500 tokens/sec — fast enough for "
    "real-time streaming inside VS Code without the user feeling a lag. "
    "The free tier (6,000 requests/day) is more than enough for a dev tool.",
    colors.HexColor("#FDECEA"), C_CORAL))

# ── Architecture diff ─────────────────────────────────────────────────────────
story.append(Spacer(1, 6*mm))
story.append(Paragraph("New Architecture — What Gets Added", h1))
story.append(hr(C_GROQ, 1))

story.append(Paragraph(
    "V1 data flow: File watcher → AST scanner → State store → Sidebar / Dashboard. "
    "V2 adds a Groq service layer that sits between the state store and the UI. "
    "When you click Explain, Quiz, or Suggest, the extension pulls your actual code "
    "snippet from the state store, builds a prompt, calls Groq, and streams the "
    "response back to both the sidebar webview and the dashboard panel.", body))
story.append(Spacer(1, 4*mm))

arch_data = [
    ["New file",             "Role"],
    ["src/groqService.ts",   "Wraps Groq SDK — one function each for explain(), quiz(), suggest(). Handles streaming."],
    ["src/promptBuilder.ts", "Builds prompts from topic name + actual code snippet extracted by AST scanner."],
    ["src/secretStore.ts",   "Stores the Groq API key securely using VS Code's context.secrets API."],
    ["src/aiPanel.ts",       "New sidebar WebviewPanel — renders streaming AI responses with typewriter effect."],
    ["data/prompts.json",    "Prompt templates for each mode (explain / quiz / suggest) — easy to tweak."],
]
at = Table(arch_data, colWidths=[48*mm, 110*mm])
at.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0),  C_PURPLE),
    ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
    ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
    ("FONTSIZE",      (0,0),(-1,-1),  9),
    ("FONTNAME",      (0,1),(-1,-1), "Helvetica"),
    ("TEXTCOLOR",     (0,1),(-1,-1), C_BODY),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, C_LIGHT]),
    ("GRID",          (0,0),(-1,-1),  0.3, C_MID),
    ("TOPPADDING",    (0,0),(-1,-1),  5),
    ("BOTTOMPADDING", (0,0),(-1,-1),  5),
    ("LEFTPADDING",   (0,0),(-1,-1),  8),
    ("VALIGN",        (0,0),(-1,-1), "TOP"),
]))
story.append(at)

# ── Phase 1 ───────────────────────────────────────────────────────────────────
story.append(Spacer(1, 8*mm))
story.append(KeepTogether([
    phase_bar(1, "Groq SDK Setup + API Key Management", "~1 hour · foundation for everything", C_GROQ),
    Spacer(1, 4*mm),
    Paragraph("Goal", h3),
    Paragraph(
        "Install the Groq SDK, get your API key stored securely inside VS Code "
        "(never in plaintext), and verify you can make a basic completion call. "
        "Don't skip secure storage — hardcoding keys in settings.json is a bad habit.", body),
    Spacer(1, 3*mm),
    Paragraph("Steps", h3),
    steps([
        ("Install SDK",         "npm install groq-sdk — official Node.js SDK, works in the VS Code extension process directly."),
        ("SecretStorage",       "Use context.secrets.store('devmap.groqKey', key) and context.secrets.get('devmap.groqKey') — built into VS Code, encrypted at rest."),
        ("Register command",    "Add command devmap.setApiKey that shows vscode.window.showInputBox({ password: true }) and saves to SecretStorage."),
        ("Create groqService",  "src/groqService.ts exports a GroqService class. Constructor calls context.secrets.get() to load the key and init the Groq client."),
        ("Test call",           "In groqService, add a ping() method: call groq.chat.completions.create with model: 'llama-3.3-70b-versatile' and a hello message. Log the response."),
        ("Error handling",      "If key is missing, show vscode.window.showWarningMessage('Set your Groq key: Cmd+Shift+P → DevMap: Set API Key')."),
    ], C_GROQ),
    Spacer(1, 3*mm),
    Paragraph("Key snippet — initialising the Groq client:", h3),
    Paragraph(
        "import Groq from 'groq-sdk';<br/>"
        "const key = await context.secrets.get('devmap.groqKey');<br/>"
        "const groq = new Groq({ apiKey: key });",
        code),
]))

# ── Phase 2 ───────────────────────────────────────────────────────────────────
story.append(Spacer(1, 8*mm))
story.append(KeepTogether([
    phase_bar(2, "Prompt Builder — Context-Aware Prompts", "~2 hours · the quality of AI = quality of prompts", C_PURPLE),
    Spacer(1, 4*mm),
    Paragraph("Goal", h3),
    Paragraph(
        "Build a prompt factory that takes a topic name + the actual code snippet "
        "where you used it, and produces a tight, focused prompt for each of the "
        "three modes. The code snippet is what makes Groq's answer feel personal "
        "— it explains YOUR code, not a generic example.", body),
    Spacer(1, 3*mm),
    Paragraph("The 3 prompt modes:", h3),
]))

mode_data = [
    ["Mode",      "Trigger",                  "What gets sent to Groq",                          "Expected output"],
    ["Explain",   "Click topic in sidebar",   "Topic name + code snippet (max 30 lines) where\nthe topic was detected", "2–3 para explanation tied to the user's actual code"],
    ["Quiz",      "Quiz button in dashboard", "Topic name + covered status + user's code context","3 MCQ or short-answer questions + answers"],
    ["Suggest",   "Auto after each scan",     "Full list of covered topics + uncovered topics",   "Top 3 topics to learn next with 1-line reason each"],
]
mt = Table(mode_data, colWidths=[18*mm, 30*mm, 64*mm, 46*mm])
mt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0),  C_PURPLE),
    ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
    ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
    ("FONTSIZE",      (0,0),(-1,-1),  8),
    ("FONTNAME",      (0,1),(-1,-1), "Helvetica"),
    ("TEXTCOLOR",     (0,1),(-1,-1), C_BODY),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, C_LIGHT]),
    ("GRID",          (0,0),(-1,-1),  0.3, C_MID),
    ("TOPPADDING",    (0,0),(-1,-1),  5),
    ("BOTTOMPADDING", (0,0),(-1,-1),  5),
    ("LEFTPADDING",   (0,0),(-1,-1),  6),
    ("VALIGN",        (0,0),(-1,-1), "TOP"),
]))
story.append(mt)

story.append(Spacer(1, 4*mm))
story.append(Paragraph("Example — Explain prompt template:", h3))
story.append(Paragraph(
    'You are a senior JS/Node.js tutor. The student used "{topic}" in their code.<br/>'
    'Here is the snippet:<br/>'
    '```{codeSnippet}```<br/>'
    'Explain what "{topic}" is, why it works here, and one tip to use it better.<br/>'
    'Be concise. Max 150 words. No generic examples — reference their code directly.',
    code))

story.append(Spacer(1, 3*mm))
story.append(Paragraph("Example — Quiz prompt template:", h3))
story.append(Paragraph(
    'Generate 3 short quiz questions about "{topic}" for a JS developer.<br/>'
    'Base questions on this code context: ```{codeSnippet}```<br/>'
    'Format: Q1: ... Answer: ... Q2: ... Answer: ... Q3: ... Answer: ...<br/>'
    'Difficulty: beginner to intermediate. Keep answers under 2 sentences.',
    code))

story.append(Spacer(1, 3*mm))
story.append(Paragraph("Example — Suggest prompt template:", h3))
story.append(Paragraph(
    'A JS/Node developer has covered these topics: {coveredList}.<br/>'
    'Remaining topics in their curriculum: {remainingList}.<br/>'
    'Suggest the top 3 topics to learn next. For each: topic name + 1 sentence why it builds on what they know.<br/>'
    'Return JSON: [{"topic":"...","reason":"..."}, ...]',
    code))

story.append(Spacer(1, 3*mm))
story.append(info_box(
    "Store all prompt templates in data/prompts.json so you can iterate on wording "
    "without touching TypeScript. Load them at runtime with fs.readFileSync.",
    colors.HexColor("#EEEDFE"), C_PURPLE))

# ── Phase 3 ───────────────────────────────────────────────────────────────────
story.append(Spacer(1, 8*mm))
story.append(KeepTogether([
    phase_bar(3, "Streaming Groq Responses", "~2 hours · makes AI feel fast and alive", C_TEAL),
    Spacer(1, 4*mm),
    Paragraph("Goal", h3),
    Paragraph(
        "Groq is fast, but streaming makes it feel instant. Instead of waiting for "
        "the full response before showing anything, you pipe each token chunk to the "
        "VS Code webview as it arrives — typewriter effect. This is the same pattern "
        "used by ChatGPT and Claude's web UI.", body),
    Spacer(1, 3*mm),
    Paragraph("Steps", h3),
    steps([
        ("Enable streaming",    "Pass stream: true to groq.chat.completions.create(). Returns an async iterable of chunks."),
        ("Iterate chunks",      "for await (const chunk of stream) { const token = chunk.choices[0]?.delta?.content; postToWebview(token); }"),
        ("postMessage tokens",  "Each token: panel.webview.postMessage({ type: 'token', content: token }). The webview appends to the DOM on each message."),
        ("Typewriter in HTML",  "In dashboard JS: window.addEventListener('message', e => { if(e.data.type==='token') el.textContent += e.data.content; })"),
        ("Start/end signals",   "Send { type: 'stream_start' } before loop and { type: 'stream_end' } after. Dashboard shows spinner then hides it."),
        ("Abort controller",    "Allow cancel: track an AbortController per request. Wire a Stop button in the dashboard to abort the stream."),
    ], C_TEAL),
    Spacer(1, 3*mm),
    Paragraph("Streaming skeleton:", h3),
    Paragraph(
        "const stream = await groq.chat.completions.create({<br/>"
        "  model: 'llama-3.3-70b-versatile', stream: true,<br/>"
        "  messages: [{ role: 'user', content: prompt }]<br/>"
        "});<br/>"
        "panel.webview.postMessage({ type: 'stream_start' });<br/>"
        "for await (const chunk of stream) {<br/>"
        "  const tok = chunk.choices[0]?.delta?.content || '';<br/>"
        "  panel.webview.postMessage({ type: 'token', content: tok });<br/>"
        "}<br/>"
        "panel.webview.postMessage({ type: 'stream_end' });",
        code),
]))

# ── Phase 4 ───────────────────────────────────────────────────────────────────
story.append(Spacer(1, 8*mm))
story.append(KeepTogether([
    phase_bar(4, "VS Code Sidebar AI Panel", "~half day · Explain + Quiz inside VS Code", C_BLUE),
    Spacer(1, 4*mm),
    Paragraph("Goal", h3),
    Paragraph(
        "Add an Explain button next to each topic in the existing TreeView. "
        "Clicking it opens a new sidebar webview (aiPanel.ts) that streams the "
        "Groq explanation. A Quiz button at the top of the panel starts quiz mode "
        "for the selected topic.", body),
    Spacer(1, 3*mm),
    Paragraph("Steps", h3),
    steps([
        ("Explain command",     "Register devmap.explainTopic command. It takes topicId as arg, pulls the code snippet from store, calls groqService.explain()."),
        ("Add button to tree",  "In TopicItem, set this.command = { command:'devmap.explainTopic', arguments:[this.id] } so clicking the item triggers the command."),
        ("Add inline icon",     "Set this.contextValue = 'topic' and in package.json 'menus'.'view/item/context' add Explain and Quiz buttons with icons."),
        ("aiPanel WebviewPanel","Create a singleton WebviewPanel in VS Code's sidebar column. Re-use across explain calls — just update the content."),
        ("Render AI response",  "aiPanel HTML: dark-themed box, topic name as header, streaming text area below, copy button, quiz button."),
        ("Quiz flow in sidebar","Quiz button triggers devmap.quizTopic. Groq returns 3 questions. Render them one by one with a Reveal Answer toggle."),
    ], C_BLUE),
    Spacer(1, 3*mm),
    Paragraph(
        "UX tip: When the AI panel is streaming, disable the Explain/Quiz buttons "
        "to prevent overlapping requests. Re-enable on stream_end.", note),
]))

# ── Phase 5 ───────────────────────────────────────────────────────────────────
story.append(Spacer(1, 8*mm))
story.append(KeepTogether([
    phase_bar(5, "Dashboard AI Integration", "~half day · full AI experience in the web panel", C_AMBER),
    Spacer(1, 4*mm),
    Paragraph("Goal", h3),
    Paragraph(
        "Upgrade the V1 web dashboard (WebviewPanel) with three new sections: "
        "an AI Explain panel for any topic, a Quiz tab, and a Smart Suggestions "
        "card that auto-runs after every scan and shows the top 3 topics to learn next.", body),
    Spacer(1, 3*mm),
    Paragraph("Steps", h3),
    steps([
        ("Topic click → explain","In dashboard JS: clicking a topic pill sends postMessage({ type:'explain', topicId }) to extension. Extension calls groqService.explain() and streams back."),
        ("Add AI panel section", "New section below the progress bars: card with topic name header, streaming text box, Copy and Quiz buttons."),
        ("Quiz tab",             "Add a Quiz tab in the dashboard nav. Shows the 3 questions returned by Groq. Each has a text input + Check Answer button."),
        ("Answer checking",      "Send the user's answer + correct answer to Groq: 'Is this answer correct? Give brief feedback.' Stream the verdict."),
        ("Suggestions card",     "After every scan, extension auto-calls groqService.suggest() and sends result to dashboard via postMessage({ type:'suggestions', data })."),
        ("Render suggestions",   "Three cards in the dashboard: topic name, reason, and a Start Learning button that immediately triggers explain for that topic."),
        ("Loading states",       "Each AI section has its own spinner. Use stream_start/stream_end messages to toggle them independently."),
    ], C_AMBER),
]))

# ── Phase 6 ───────────────────────────────────────────────────────────────────
story.append(Spacer(1, 8*mm))
story.append(KeepTogether([
    phase_bar(6, "Polish, Rate Limiting & Caching", "~2 hours · ship-ready quality", C_CORAL),
    Spacer(1, 4*mm),
    Paragraph("Goal", h3),
    Paragraph(
        "Groq's free tier allows 6,000 requests/day and 30 requests/min. "
        "Without caching, clicking Explain on the same topic repeatedly burns quota. "
        "Add a simple in-memory cache and a rate-limit guard.", body),
    Spacer(1, 3*mm),
    Paragraph("Steps", h3),
    steps([
        ("Cache explain results", "Map<topicId, string> in memory. Before calling Groq, check cache. If hit, stream cached text character-by-character for effect."),
        ("Cache quiz questions",  "Same Map<topicId, QuizQuestion[]>. Regenerate only if user clicks Refresh Quiz."),
        ("Rate limit guard",      "Track last-call timestamp. If < 2 seconds since last call, queue the request with setTimeout. Show 'Thinking...' spinner."),
        ("Suggestions cooldown",  "Only re-run suggest() if the covered topic list has actually changed since last run. Compare with a hash of the covered set."),
        ("Token cost logging",    "Log chunk.usage?.total_tokens to VS Code's Output Channel (devmap.outputChannel) so you can see how much quota you use."),
        ("User feedback",         "After each explanation, add a thumbs up/down in the dashboard. Store locally — future use for fine-tuning prompts."),
    ], C_CORAL),
]))

# ── Full file structure ───────────────────────────────────────────────────────
story.append(PageBreak())
story.append(Paragraph("Updated Project Structure", h1))
story.append(hr(C_GROQ, 1))
story.append(Paragraph(
    "devmap/  (V2 — new files marked with ★)<br/>"
    "├── src/<br/>"
    "│   ├── extension.ts              ← updated: new commands, groqService init<br/>"
    "│   ├── scanner.ts                ← unchanged from V1<br/>"
    "│   ├── topicProvider.ts          ← updated: Explain/Quiz buttons on items<br/>"
    "│   ├── dashboardPanel.ts         ← updated: AI sections, quiz tab, suggestions<br/>"
    "│   ├── store.ts                  ← updated: stores code snippets per topic<br/>"
    "│   ├── groqService.ts          ★ ← explain(), quiz(), suggest() + streaming<br/>"
    "│   ├── promptBuilder.ts        ★ ← builds prompts from topic + code context<br/>"
    "│   ├── secretStore.ts          ★ ← wraps context.secrets for API key<br/>"
    "│   ├── aiPanel.ts              ★ ← sidebar WebviewPanel for AI responses<br/>"
    "│   └── cache.ts                ★ ← in-memory cache + rate limit guard<br/>"
    "├── data/<br/>"
    "│   ├── topics.json               ← unchanged from V1<br/>"
    "│   └── prompts.json            ★ ← prompt templates for all 3 modes<br/>"
    "├── media/<br/>"
    "│   ├── check.svg / circle.svg    ← unchanged<br/>"
    "│   └── groq-logo.svg           ★ ← optional branding in dashboard<br/>"
    "├── package.json                  ← updated: new commands, new view<br/>"
    "└── tsconfig.json                 ← unchanged",
    code))

# ── Data flow ─────────────────────────────────────────────────────────────────
story.append(Spacer(1, 6*mm))
story.append(Paragraph("Full V2 Data Flow", h1))
story.append(hr(C_GROQ, 1))

flow_data = [
    ["Step", "Actor",           "Action"],
    ["1",  "File watcher",      "onDidSave fires → scanner.ts parses AST → detects topics + extracts code snippets"],
    ["2",  "Store",             "Updates covered topics Map AND stores snippet per topicId for AI context"],
    ["3",  "Auto-suggest",      "If covered set changed → groqService.suggest(coveredList, remainingList) → stream to dashboard"],
    ["4",  "User clicks topic", "TreeView command fires devmap.explainTopic(topicId)"],
    ["5",  "promptBuilder",     "Loads template from prompts.json, injects topic name + code snippet"],
    ["6",  "groqService",       "Calls Groq API with stream:true, iterates chunks"],
    ["7",  "aiPanel + dashboard","Each token posted via postMessage → typewriter render in both panels"],
    ["8",  "Cache",             "Full response stored in Map<topicId, string> for instant replay"],
    ["9",  "Quiz flow",         "User clicks Quiz → groqService.quiz() → 3 questions rendered → answers checked via Groq"],
]
ft = Table(flow_data, colWidths=[10*mm, 32*mm, 116*mm])
ft.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0),  C_INDIGO),
    ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
    ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
    ("FONTSIZE",      (0,0),(-1,-1),  9),
    ("FONTNAME",      (0,1),(-1,-1), "Helvetica"),
    ("TEXTCOLOR",     (0,1),(-1,-1), C_BODY),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, C_LIGHT]),
    ("GRID",          (0,0),(-1,-1),  0.3, C_MID),
    ("TOPPADDING",    (0,0),(-1,-1),  5),
    ("BOTTOMPADDING", (0,0),(-1,-1),  5),
    ("LEFTPADDING",   (0,0),(-1,-1),  8),
    ("ALIGN",         (0,1),(0,-1),  "CENTER"),
    ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ("FONTNAME",      (0,1),(0,-1),  "Helvetica-Bold"),
    ("TEXTCOLOR",     (0,1),(0,-1),  C_GROQ),
]))
story.append(ft)

# ── What you learn ────────────────────────────────────────────────────────────
story.append(Spacer(1, 6*mm))
story.append(Paragraph("What You Learn Building V2", h1))
story.append(hr(C_TEAL, 1))

learn_data = [
    ["Concept",                      "Where it shows up in V2"],
    ["Async iterables (for await)",  "Streaming Groq response chunks in groqService.ts"],
    ["AbortController",              "Cancelling in-flight Groq stream requests"],
    ["VS Code SecretStorage API",    "Storing the Groq API key securely"],
    ["postMessage pattern",          "Extension ↔ WebviewPanel bidirectional messaging"],
    ["Prompt engineering",           "Writing effective prompts in prompts.json"],
    ["In-memory caching (Map)",      "cache.ts — avoiding redundant API calls"],
    ["Rate limiting patterns",       "Timestamp tracking + setTimeout queue in cache.ts"],
    ["JSON parsing + validation",    "Parsing Groq's suggest() JSON response safely"],
    ["Error boundaries in Node",     "Wrapping every Groq call in try/catch with user-facing fallback"],
    ["Template strings + injection", "Building prompts dynamically in promptBuilder.ts"],
    ["Singleton pattern",            "aiPanel.ts — one panel instance reused across calls"],
]
lt = Table(learn_data, colWidths=[72*mm, 86*mm])
lt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0),  C_TEAL),
    ("TEXTCOLOR",     (0,0),(-1,0),  C_WHITE),
    ("FONTNAME",      (0,0),(-1,0),  "Helvetica-Bold"),
    ("FONTSIZE",      (0,0),(-1,-1),  9),
    ("FONTNAME",      (0,1),(-1,-1), "Helvetica"),
    ("TEXTCOLOR",     (0,1),(-1,-1), C_BODY),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [C_WHITE, colors.HexColor("#E1F5EE")]),
    ("GRID",          (0,0),(-1,-1),  0.3, C_MID),
    ("TOPPADDING",    (0,0),(-1,-1),  5),
    ("BOTTOMPADDING", (0,0),(-1,-1),  5),
    ("LEFTPADDING",   (0,0),(-1,-1),  8),
    ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
]))
story.append(lt)

# ── Quick start commands ──────────────────────────────────────────────────────
story.append(Spacer(1, 6*mm))
story.append(Paragraph("V2 Setup Commands", h1))
story.append(hr(C_PURPLE, 1))

cmds = [
    ("Install Groq SDK",         "npm install groq-sdk"),
    ("Get Groq API key",         "Sign up at console.groq.com → API Keys → Create key (free tier)"),
    ("Set key in DevMap",        "Cmd+Shift+P → 'DevMap: Set API Key' → paste key"),
    ("Recommended model",        "llama-3.3-70b-versatile  (fast, smart, free tier)"),
    ("Test streaming locally",   "Add a test command devmap.testGroq that runs ping() and logs to Output Channel"),
    ("Watch + compile",          "npm run watch  (same as V1)"),
    ("Check quota usage",        "console.groq.com → Usage dashboard — monitor daily requests"),
]
for label, cmd in cmds:
    story.append(Paragraph(f"<b>{label}</b>", S("cl", fontName="Helvetica-Bold",
                  fontSize=9, textColor=C_BODY, leading=14, spaceBefore=5)))
    story.append(Paragraph(cmd, code))

# ── V3 ideas ──────────────────────────────────────────────────────────────────
story.append(Spacer(1, 6*mm))
story.append(Paragraph("V3 Ideas — After You Ship V2", h1))
story.append(hr(C_AMBER, 1))
for item in [
    "Switch models on the fly — let the user pick between llama3-8b (faster) and llama3-70b (smarter) in settings",
    "Multi-file context — send all files where a topic appears, not just one snippet, for richer explanations",
    "Spaced repetition — track which quiz questions you got wrong and resurface them after 3 days",
    "Voice mode — pipe Groq text output to a TTS API and read explanations aloud while you code",
    "GitHub Gist sync — save explanation history + quiz scores to a Gist so they persist across machines",
    "Custom curriculum — let the user add their own topics.json entries and DevMap auto-generates AST patterns using Groq",
]:
    story.append(Paragraph(f"• {item}", bul))

story.append(Spacer(1, 10*mm))
story.append(hr(C_MID))
story.append(Paragraph(
    "DevMap V2 — Groq AI Integration Plan  ·  Built for AI Engineers going full stack",
    S("footer", fontName="Helvetica", fontSize=8, textColor=C_MUTED,
      leading=12, alignment=TA_CENTER)))

# ── Render ─────────────────────────────────────────────────────────────────────
doc.build(story, onFirstPage=draw_cover)
print("Done:", OUTPUT)
