import telebot
from telebot import types
import hashlib
import os
import json
import sys
import threading
import time as _time
from datetime import datetime, timedelta
import urllib.request
import urllib.error

# ── Credentials come from environment variables — never hardcode a bot token in source. ──
TOKEN = os.environ.get('BOT_TOKEN', '').strip()
_admin_id_raw = os.environ.get('ADMIN_ID', '').strip()
if not TOKEN:
    print('❌ BOT_TOKEN environment variable is not set. Set it before starting bot.py. Exiting.')
    sys.exit(1)
try:
    ADMIN_ID = int(_admin_id_raw) if _admin_id_raw else 0
except ValueError:
    print('❌ ADMIN_ID must be a numeric Telegram user ID.')
    sys.exit(1)
if not ADMIN_ID:
    print('⚠️  ADMIN_ID environment variable is not set — admin-only bot commands will be disabled for everyone.')

PANEL_API_URL = os.environ.get('PANEL_API_URL', '').rstrip('/')
PANEL_SECRET = os.environ.get('BOT_API_SECRET', '')

def sync_user_to_panel(username, password, display_name=None):
    """Create or update user in the website panel via API."""
    if not PANEL_API_URL or not PANEL_SECRET:
        return
    try:
        data = json.dumps({
            'username': username,
            'password': password,
            'display_name': display_name or username
        }).encode('utf-8')
        req = urllib.request.Request(
            f'{PANEL_API_URL}/api/auth/bot-create',
            data=data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {PANEL_SECRET}'
            },
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            if result.get('success') or result.get('message') == 'User already exists':
                print(f"✅ Synced user '{username}' to panel")
            else:
                print(f"⚠️ Panel sync returned: {result}")
    except urllib.error.HTTPError as e:
        print(f"❌ Panel sync HTTP error {e.code}: {e.read().decode('utf-8', errors='replace')[:200]}")
    except Exception as e:
        print(f"❌ Panel sync error: {e}")

bot = telebot.TeleBot(TOKEN)
_BOT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_PATH = os.environ.get('BASE_PATH') or os.path.join(_BOT_DIR, 'panel_data')
os.makedirs(BASE_PATH, exist_ok=True)

# ──────────────────────────────────────────────
#  آليات مساعدة عامة
# ──────────────────────────────────────────────

def kb_button(text, style=None, **kwargs):
    if style:
        try:
            return types.KeyboardButton(text, style=style, **kwargs)
        except TypeError:
            pass
    return types.KeyboardButton(text, **kwargs)

def ikb_button(text, style=None, **kwargs):
    if style:
        try:
            return types.InlineKeyboardButton(text, style=style, **kwargs)
        except TypeError:
            pass
    return types.InlineKeyboardButton(text, **kwargs)

def load_json_file(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default

def save_json_file(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ──────────────────────────────────────────────
#  ملفات البيانات
# ──────────────────────────────────────────────

USERS_FILE = os.path.join(BASE_PATH, 'users.json')
USERS_FOLDER = os.path.join(BASE_PATH, 'users_data')
PROCESSES_FILE = os.path.join(BASE_PATH, 'processes.json')
REFERRALS_FILE = os.path.join(BASE_PATH, 'referrals.json')
SEEN_USERS_FILE = os.path.join(BASE_PATH, 'seen_users.json')
BOT_SETTINGS_FILE = os.path.join(BASE_PATH, 'bot_settings.json')
SUBSCRIPTION_PLANS_FILE = os.path.join(BASE_PATH, 'subscription_plans.json')
PENDING_SUBS_FILE = os.path.join(BASE_PATH, 'pending_subscriptions.json')
IPS_FILE = os.path.join(BASE_PATH, 'ips.json')
ACTIVITY_LOG_FILE = os.path.join(BASE_PATH, 'activity_log.json')
REQUIRED_INVITES = 5

def load_users():       return load_json_file(USERS_FILE, {})
def save_users(users):  save_json_file(USERS_FILE, users)
def load_processes():   return load_json_file(PROCESSES_FILE, {})
def load_referrals():   return load_json_file(REFERRALS_FILE, {})
def save_referrals(d):  save_json_file(REFERRALS_FILE, d)
def load_seen_users():  return set(load_json_file(SEEN_USERS_FILE, []))
def save_seen_users(s): save_json_file(SEEN_USERS_FILE, list(s))
def load_pending_subs(): return load_json_file(PENDING_SUBS_FILE, {})
def save_pending_subs(d): save_json_file(PENDING_SUBS_FILE, d)
def load_ips():         return load_json_file(IPS_FILE, {'pool_index': 0, 'assigned': {}})
def save_ips(d):        save_json_file(IPS_FILE, d)

# ──────────────────────────────────────────────
#  سجل العمليات (Activity Log)
# ──────────────────────────────────────────────

def _log_action(action_type, admin_id=None, details=None):
    """تسجيل عملية في سجل الأدمن."""
    log = load_json_file(ACTIVITY_LOG_FILE, [])
    entry = {
        'time': datetime.now().isoformat(),
        'type': action_type,
        'admin': admin_id,
        'details': details or ''
    }
    log.append(entry)
    if len(log) > 500:
        log = log[-500:]
    save_json_file(ACTIVITY_LOG_FILE, log)

# ──────────────────────────────────────────────
#  إعدادات البوت
# ──────────────────────────────────────────────

def load_bot_settings():
    return load_json_file(BOT_SETTINGS_FILE, {
        'force_channel': '@ul2fg',
        'points_per_server': 10,
        'points_per_invite': 1,
        'dev_channel': 'https://t.me/ul2fg',
        'dev_user': 'https://t.me/I_tt_6',
        'admin_list': [],
        'codes': {},
        'panel_url': ''
    })

def save_bot_settings(s):
    save_json_file(BOT_SETTINGS_FILE, s)

DEFAULT_SUBSCRIPTION_PLANS = {
    'free_trial': {'label': '🆓 الباقة المجانية', 'days': 1,   'price_stars': 0},
    'pro':        {'label': '⭐ باقة برو',          'days': 7,   'price_stars': 15},
    'premium':    {'label': '💎 باقة بريميوم',      'days': 15,  'price_stars': 50},
    'ultimate':   {'label': '👑 باقة ألتميت',      'days': 30,  'price_stars': 115},
    'payment_contact': '@V_9_X_9'
}

def load_subscription_plans():
    plans = load_json_file(SUBSCRIPTION_PLANS_FILE, dict(DEFAULT_SUBSCRIPTION_PLANS))
    changed = False
    for key, val in DEFAULT_SUBSCRIPTION_PLANS.items():
        if key not in plans:
            plans[key] = val
            changed = True
        elif isinstance(val, dict) and isinstance(plans.get(key), dict):
            for f, fv in val.items():
                if f not in plans[key]:
                    plans[key][f] = fv
                    changed = True
    if changed:
        save_json_file(SUBSCRIPTION_PLANS_FILE, plans)
    return plans

def save_subscription_plans(p):
    save_json_file(SUBSCRIPTION_PLANS_FILE, p)

# ──────────────────────────────────────────────
#  دوال المستخدمين والإحالات
# ──────────────────────────────────────────────

def get_invited_count(telegram_id):
    referrals = load_referrals()
    return len(referrals.get(str(telegram_id), {}).get('invited', []))

def mark_user_seen_and_check_new(telegram_id):
    seen = load_seen_users()
    if telegram_id in seen:
        return False
    seen.add(telegram_id)
    save_seen_users(seen)
    return True

def user_accounts_by_telegram(telegram_id):
    users = load_users()
    return [(u, d) for u, d in users.items() if d.get('telegram_id') == telegram_id]

def user_ref(u):
    name = u.first_name or "مستخدم"
    username = f"@{u.username}" if u.username else "بدون يوزر"
    return f"{name} ({username}) — `{u.id}`"

def find_user_by_query(query):
    """يبحث عن مستخدم بالاسم (username) أو بالـ Telegram ID. يرجع (username, data) أو (None, None)."""
    users = load_users()
    q = query.strip()
    if q in users:
        return q, users[q]
    # Search by telegram_id (try both int and string comparison)
    for u, data in users.items():
        stored_tid = data.get('telegram_id')
        if stored_tid is not None:
            if str(stored_tid) == q or (q.isdigit() and stored_tid == int(q)):
                return u, data
    # Case-insensitive username search
    q_lower = q.lower()
    for u, data in users.items():
        if u.lower() == q_lower:
            return u, data
        # Also check display_name if available
        dn = data.get('display_name', '').lower()
        if dn == q_lower:
            return u, data
    return None, None

# ──────────────────────────────────────────────
#  نظام الباقات
# ──────────────────────────────────────────────

def activate_subscription_for_telegram(telegram_id, plan_key):
    plans = load_subscription_plans()
    plan_info = plans.get(plan_key)
    if not plan_info:
        return False, 0
    days = int(plan_info.get('days', 0) or 0)
    users = load_users()
    count = 0
    new_expiry = (datetime.now() + timedelta(days=days)).isoformat()
    for uname, data in users.items():
        if data.get('telegram_id') == telegram_id:
            data['plan'] = plan_key
            data['expiry'] = new_expiry
            data['expiry_notified'] = False
            count += 1
    if count:
        save_users(users)
    return count > 0, count

def format_plan_line(key, info):
    price = info.get('price_stars', 0)
    price_txt = "مجانية" if not price else f"{price} نجمة ⭐"
    return f"{info.get('label', key)}\n  ⏳ المدة: {info.get('days', 0)} يوم\n  💵 السعر: {price_txt}"

# ──────────────────────────────────────────────
#  نظام IP تمثيلي
# ──────────────────────────────────────────────

def assign_ip(username):
    data = load_ips()
    assigned = data.setdefault('assigned', {})
    if username in assigned:
        return assigned[username]
    idx = data.get('pool_index', 0) + 1
    data['pool_index'] = idx
    ip = f"10.{(idx // 65536) % 256}.{(idx // 256) % 256}.{idx % 256}"
    assigned[username] = ip
    save_ips(data)
    return ip

# ──────────────────────────────────────────────
#  MarkdownV2 helpers
# ──────────────────────────────────────────────

_MD2_SPECIAL = set('_*[]()~`>#+-=|{}.!\\')

def escape_md2(text):
    if text is None:
        return ''
    text = str(text)
    return ''.join(('\\' + ch) if ch in _MD2_SPECIAL else ch for ch in text)

# ──────────────────────────────────────────────
#  نظام الاشتراك الإجباري
# ──────────────────────────────────────────────

def check_force_subscribe(user_id):
    settings = load_bot_settings()
    channel = settings.get('force_channel', '').strip()
    if not channel:
        return True
    try:
        member = bot.get_chat_member(channel, user_id)
        return member.status in ['member', 'administrator', 'creator']
    except Exception:
        return False

def enforce_subscription(message):
    if is_admin(message.from_user.id):
        return True
    settings = load_bot_settings()
    channel = settings.get('force_channel', '').strip()
    if not channel:
        return True
    subscribed = False
    try:
        member = bot.get_chat_member(channel, message.from_user.id)
        subscribed = member.status in ['member', 'administrator', 'creator']
    except Exception:
        subscribed = False
    if subscribed:
        return True
    chan_link = channel if channel.startswith('http') else f"https://t.me/{channel.lstrip('@')}"
    sep = "\u200B\n"
    prompt = (
        ">⛔ عـذراً\\!\n" + sep +
        ">لا يمكنك استخدام البوت قبل الاشتراك في القناة\n" + sep +
        ">اشترك في القناة ثم اضغط زر **تحققت من الاشتراك** 👇"
    )
    mk = types.InlineKeyboardMarkup(row_width=1)
    mk.add(
        ikb_button("🔔 اشترك في القناة الآن", url=chan_link, style="success"),
        ikb_button("✅ تحققت من الاشتراك", callback_data="check_sub_verify", style="primary")
    )
    bot.send_message(message.chat.id, prompt, parse_mode="MarkdownV2", reply_markup=mk)
    return False

def is_admin(user_id):
    if user_id == ADMIN_ID:
        return True
    settings = load_bot_settings()
    return user_id in settings.get('admin_list', [])

def notify_admins(text, markup=None):
    settings = load_bot_settings()
    admin_ids = set(settings.get('admin_list', []))
    admin_ids.add(ADMIN_ID)
    for aid in admin_ids:
        try:
            bot.send_message(aid, text, parse_mode="Markdown", reply_markup=markup)
        except Exception:
            pass

def _notify_admin_log(text, admin_id=None, markup=None):
    """إشعار الأدمن + تسجيل في السجل."""
    notify_admins(text, markup=markup)
    _log_action(text.split('\n')[0][:60], admin_id=admin_id, details=text)

def _chat_button(telegram_id):
    """ينشئ InlineKeyboardMarkup بزر فتح الشات مع مستخدم."""
    if not telegram_id:
        return None
    mk = types.InlineKeyboardMarkup(row_width=1)
    mk.add(ikb_button(f"💬 فتح الشات مع المستخدم", url=f"https://t.me/user?id={telegram_id}", style="primary"))
    return mk

# ──────────────────────────────────────────────
#  نظام نقاط آمن — إضافة / خصم / استرجاع
# ──────────────────────────────────────────────

def add_points(username, amount, reason=""):
    """إضافة نقاط لمستخدم. يرجع الرصيد الجديد أو None لو المستخدم غير موجود."""
    users = load_users()
    if username not in users:
        return None
    users[username]['points'] = users[username].get('points', 0) + amount
    save_users(users)
    return users[username]['points']

def deduct_points(username, amount, reason=""):
    """خصم نقاط من مستخدم. يرجع (الرصيد الجديد, هل تم الخصم) أو (None, False)."""
    users = load_users()
    if username not in users:
        return None, False
    old = users[username].get('points', 0)
    users[username]['points'] = max(0, old - amount)
    save_users(users)
    return users[username]['points'], True

def refund_points(username, amount, reason=""):
    """استرجاع النقاط (إعادة الشحن). يرجع الرصيد الجديد."""
    return add_points(username, amount, reason)

# ──────────────────────────────────────────────
#  الكيبوردات
# ──────────────────────────────────────────────

def main_keyboard(user_id):
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    markup.row(kb_button("👤 ملفي الشخصي", style="primary"))
    markup.row(
        kb_button("🖥️ إنشاء سيرفر", style="success"),
        kb_button("💰 شراء نقاط", style="success")
    )
    markup.row(kb_button("🎁 استخدام كود", style="success"))
    markup.row(kb_button("📦 الباقات", style="success"))
    markup.row(
        kb_button("❓ مساعدة", style="primary"),
        kb_button("🔗 إحالة", style="primary")
    )
    markup.row(
        kb_button("👨‍💻 المطور", style="primary"),
        kb_button("📢 قناة المطور", style="primary")
    )
    if is_admin(user_id):
        markup.row(kb_button("🛠️ لوحة الأدمن", style="danger"))
    return markup

def admin_keyboard():
    markup = types.InlineKeyboardMarkup(row_width=2)
    # 🔵 معلومات وإعدادات
    markup.row(
        ikb_button("📊 إحصائيات", callback_data="admin_stats", style="primary"),
        ikb_button("🔍 فحص مستخدم", callback_data="admin_check_user", style="primary")
    )
    markup.row(
        ikb_button("📋 قائمة الأكواد", callback_data="admin_list_codes", style="primary"),
        ikb_button("🖥️ قائمة السيرفرات", callback_data="admin_list_servers", style="primary")
    )
    markup.row(
        ikb_button("💲 تكلفة السيرفر", callback_data="admin_set_server_cost", style="primary"),
        ikb_button("🌐 تعيين لينك اللوحة", callback_data="admin_set_panel_url", style="primary")
    )
    markup.row(
        ikb_button("📦 إعدادات الباقات", callback_data="admin_sub_settings", style="primary"),
        ikb_button("🔗 نقاط الإحالة", callback_data="admin_set_invite_points", style="primary")
    )
    markup.row(
        ikb_button("🧾 طلبات الدفع", callback_data="admin_pending_subs", style="primary"),
        ikb_button("📜 سجل العمليات", callback_data="admin_activity_log", style="primary")
    )
    # 🟢 إجراءات إضافة/تفعيل
    markup.row(
        ikb_button("🔓 فك حظر", callback_data="admin_unban", style="success"),
        ikb_button("➕ إضافة أدمن", callback_data="admin_add_admin", style="success")
    )
    markup.row(
        ikb_button("➕ إضافة قناة إجبارية", callback_data="admin_add_channel", style="success"),
        ikb_button("➕ إضافة كود", callback_data="admin_add_code", style="success")
    )
    markup.row(
        ikb_button("➕ إضافة نقاط", callback_data="admin_add_points", style="success"),
        ikb_button("✏️ تعديل سيرفرات مستخدم", callback_data="admin_edit_max_servers", style="success")
    )
    # 🔴 حذف/حظر/خصم
    markup.row(
        ikb_button("🚫 حظر مستخدم", callback_data="admin_ban", style="danger"),
        ikb_button("🗑️ حذف أدمن", callback_data="admin_del_admin", style="danger")
    )
    markup.row(
        ikb_button("🗑️ حذف قناة إجبارية", callback_data="admin_del_channel", style="danger"),
        ikb_button("➖ خصم نقاط", callback_data="admin_del_points", style="danger")
    )
    markup.row(
        ikb_button("🗑️ حذف مستخدم", callback_data="admin_delete_user", style="danger"),
        ikb_button("📢 بث رسالة", callback_data="admin_broadcast", style="danger")
    )
    return markup

# ──────────────────────────────────────────────
#  /start
# ──────────────────────────────────────────────

@bot.message_handler(commands=['start'])
def start(message):
    if not enforce_subscription(message):
        return

    if mark_user_seen_and_check_new(message.from_user.id):
        notify_admins(
            f"🆕 *مستخدم جديد دخل البوت*\n👤 {user_ref(message.from_user)}",
            markup=_chat_button(message.from_user.id)
        )

    args = message.text.split()
    if len(args) > 1:
        try:
            inviter_id = int(args[1])
        except ValueError:
            inviter_id = None
        if inviter_id and inviter_id != message.from_user.id:
            referrals = load_referrals()
            key = str(inviter_id)
            entry = referrals.get(key, {'invited': []})
            if message.from_user.id not in entry['invited']:
                entry['invited'].append(message.from_user.id)
                referrals[key] = entry
                save_referrals(referrals)

                settings = load_bot_settings()
                users = load_users()
                for u, data in users.items():
                    if data.get('telegram_id') == inviter_id:
                        data['points'] = data.get('points', 0) + settings.get('points_per_invite', 1)
                        save_users(users)
                        break

                count = len(entry['invited'])
                notify_admins(
                    f"🔗 *إحالة جديدة*\n"
                    f"👤 الداعي: `{inviter_id}`\n"
                    f"👤 المدعو: {user_ref(message.from_user)}\n"
                    f"📊 إجمالي دعوات الداعي: {count}/{REQUIRED_INVITES}",
                    markup=_chat_button(message.from_user.id)
                )
                try:
                    if count < REQUIRED_INVITES:
                        bot.send_message(inviter_id,
                            f"🎉 صديق جديد اشترك عبر رابطك!\n"
                            f"📊 عدد دعواتك: {count}/{REQUIRED_INVITES}")
                    else:
                        bot.send_message(inviter_id,
                            f"🎉 صديق جديد اشترك عبر رابطك!\n"
                            f"✅ لقد أكملت {REQUIRED_INVITES} دعوات، يمكنك الآن إنشاء سيرفرك!")
                except Exception:
                    pass

    sep = "\u200B\n"
    welcome_caption = (
        ">أهـلاً بـك فـي بـوت ELMODMEN VPS\n" + sep +
        ">هنـا تجـد سيـرفرات VPS بلـغـه بـايثـون\n" + sep +
        ">مميـزاتـنا  :\n" + sep +
        ">عـزل آمـن بيـن السـيرفـرات\n" + sep +
        ">حـمايـه قـويه ضـد الهجـمات\n" + sep +
        ">سـهـوله التحـكم فـي ملفـاتك\n" + sep +
        ">اسـتقـرار النـظام الـدائــم\n" + sep +
        ">مـراقـبه الشبـكه و حـمايه المـلفات من أي هجـمات\n" + sep +
        ">عـمل دائـم بـدون تـوقف أبـداً\n" + sep +
        ">*قـم بـالبــدء الآن نحـو القـمه*"
    )
    bot.send_photo(
        message.chat.id,
        photo="https://ibb.co/B202WyPL",
        caption=welcome_caption,
        parse_mode="MarkdownV2",
        reply_markup=main_keyboard(message.from_user.id)
    )

# ──────────────────────────────────────────────
#  ملفي الشخصي
# ──────────────────────────────────────────────

@bot.message_handler(func=lambda m: m.text == "👤 ملفي الشخصي")
def my_info(message):
    if not enforce_subscription(message):
        return
    users = load_users()
    ips_data = load_ips()
    assigned_ips = ips_data.get('assigned', {})

    my_servers = []
    for u, data in users.items():
        if data.get('telegram_id') == message.from_user.id:
            my_servers.append((u, data))

    if not my_servers:
        bot.send_message(message.chat.id, "❌ لم يتم العثور على حساب مرتبط بهذا التليجرام.\nقم بإنشاء حساب أولاً.")
        return

    settings = load_bot_settings()
    panel_url = settings.get('panel_url', '').strip()
    plans = load_subscription_plans()

    first_uname, first_data = my_servers[0]
    plan_key = first_data.get('plan', 'free_trial')
    plan_info = plans.get(plan_key, plans['free_trial'])
    expiry = first_data.get('expiry')
    if expiry:
        try:
            remaining = (datetime.fromisoformat(expiry) - datetime.now()).days
            expiry_txt = f"{max(0, remaining)} يوم متبقي" if remaining >= 0 else "منتهية ⚠️"
        except Exception:
            expiry_txt = "-"
    else:
        expiry_txt = "بدون تاريخ انتهاء"

    msg = f"👤 **ملفك الشخصي:**\n\n"
    msg += f"📦 باقتك: {plan_info.get('label', plan_key)} — {expiry_txt}\n"
    msg += f"💰 النقاط: `{first_data.get('points', 0)}` نقطة\n"
    msg += f"🖥️ السيرفرات المتاحة: `{first_data.get('max_servers', 2)}`\n"
    msg += f"📅 تاريخ الإنشاء: `{first_data.get('created', '-')[:10]}`\n\n"
    msg += f"━━━━━━━━━━━━━━━━━━\n"
    msg += f"🖥️ **سيرفراتك ({len(my_servers)}):**\n\n"

    for idx, (uname, data) in enumerate(my_servers, 1):
        ip = assigned_ips.get(uname, 'غير متاح')
        password = data.get('password_plain', '🔒 مشفرة')
        msg += f"**السيرفر {idx}:**\n"
        msg += f"  👤 المستخدم: `{uname}`\n"
        msg += f"  🔑 كلمة السر: `{password}`\n"
        msg += f"  🌐 الـ IP: `{ip}`\n\n"

    mk = types.InlineKeyboardMarkup()
    if panel_url:
        mk.add(ikb_button("🌐 لوحة التحكم", url=panel_url, style="primary"))
    bot.send_message(message.chat.id, msg, parse_mode="Markdown",
                     reply_markup=mk if panel_url else None)

# ──────────────────────────────────────────────
#  إنشاء سيرفر
# ──────────────────────────────────────────────

@bot.message_handler(func=lambda m: m.text == "🖥️ إنشاء سيرفر")
def create_account_start(message):
    if not enforce_subscription(message):
        return
    users = load_users()
    user_data = None
    uname = None
    for u, data in users.items():
        if data.get('telegram_id') == message.from_user.id:
            user_data = data
            uname = u
            break
    if user_data:
        settings = load_bot_settings()
        cost = settings.get('points_per_server', 5)
        pts = user_data.get('points', 0)
        max_srv = user_data.get('max_servers', 1)
        mk = types.InlineKeyboardMarkup(row_width=1)
        mk.add(ikb_button(
            f"🖥️ شراء سيرفر إضافي ({cost} نقطة) — رصيدك: {pts} نقطة",
            callback_data="buy_server_slot", style="success"
        ))
        bot.send_message(message.chat.id,
            f"✅ لديك حساب بالفعل!\n\n"
            f"👤 المستخدم: `{uname}`\n"
            f"🖥️ سيرفراتك المتاحة: `{max_srv}`\n"
            f"💰 رصيدك: `{pts}` نقطة\n\n"
            f"يمكنك زيادة عدد سيرفراتك بشراء سيرفر إضافي مقابل {cost} نقطة:",
            parse_mode="Markdown", reply_markup=mk)
        return

    invited_count = get_invited_count(message.from_user.id)
    if invited_count < REQUIRED_INVITES:
        remaining = REQUIRED_INVITES - invited_count
        link = f"https://t.me/{(bot.get_me().username)}?start={message.from_user.id}"
        bot.send_message(message.chat.id,
            f"🔒 لازم تدعو {REQUIRED_INVITES} أشخاص على الأقل قبل ما تقدر تنشئ سيرفر.\n\n"
            f"✅ عدد دعواتك الحالي: `{invited_count}/{REQUIRED_INVITES}`\n"
            f"➕ متبقي عليك: `{remaining}` دعوة\n\n"
            f"🔗 شارك رابط دعوتك مع أصدقائك:\n`{link}`",
            parse_mode="Markdown")
        return

    msg = bot.send_message(message.chat.id, "🚀 أرسل اسم المستخدم الذي تريده (باللغة الإنجليزية):")
    bot.register_next_step_handler(msg, process_username)

def process_username(message):
    if not enforce_subscription(message):
        return
    username = message.text.strip()
    if not username or not username.isalnum():
        bot.send_message(message.chat.id, "❌ اسم مستخدم غير صالح! استخدم أحرف وأرقام فقط.")
        return

    users = load_users()
    if username in users:
        bot.send_message(message.chat.id, "❌ اسم المستخدم هذا مأخوذ بالفعل.")
        return

    msg = bot.send_message(message.chat.id, "ارسل كلمة المرور التي تريدها:")
    bot.register_next_step_handler(msg, lambda m: process_password(m, username))

def process_password(message, username):
    if not enforce_subscription(message):
        return
    password = message.text.strip()
    if len(password) < 6:
        bot.send_message(message.chat.id, "❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل.")
        return

    users = load_users()
    users[username] = {
        'password': hashlib.sha256(password.encode()).hexdigest(),
        'password_plain': password,
        'max_sessions': 999,
        'max_servers': 2,
        'points': 0,
        'main_file': 'main.py',
        'created': datetime.now().isoformat(),
        'expiry': (datetime.now() + timedelta(days=load_subscription_plans().get('free_trial', {}).get('days', 7))).isoformat(),
        'plan': 'free_trial',
        'expiry_notified': False,
        'telegram_id': message.from_user.id,
        'banned': False
    }
    save_users(users)
    os.makedirs(os.path.join(USERS_FOLDER, username), exist_ok=True)
    assigned_ip = assign_ip(username)
    sync_user_to_panel(username, password)
    _send_server_created(message.chat.id, message.from_user, username, password, assigned_ip)
    _notify_admin_log(
        f"🖥️ *تم إنشاء سيرفر جديد*\n"
        f"👤 المستخدم: {user_ref(message.from_user)}\n"
        f"🔑 اسم الحساب: `{username}`",
        admin_id=message.from_user.id,
        markup=_chat_button(message.from_user.id)
    )

def _send_server_created(chat_id, user, username, password, assigned_ip):
    settings = load_bot_settings()
    panel_url = settings.get('panel_url', '').strip()
    ip_str = escape_md2(assigned_ip or 'غير متاح')
    uname_str = escape_md2(username)
    pass_str = escape_md2(password)
    caption = (
        f">تـم إنشـاء السـيـرفر بـنجـاح  💫\n"
        f">\n"
        f">🌐 الـ IP  :  `{ip_str}`\n"
        f">إسم المسـتخدم  :  `{uname_str}`\n"
        f">كلـمـة المـرور  :  `{pass_str}`"
    )
    markup_photo = types.InlineKeyboardMarkup()
    if panel_url:
        markup_photo.add(ikb_button("🌐 لوحة التحكم", url=panel_url, style="primary"))
    bot.send_photo(
        chat_id,
        photo="https://ibb.co/B202WyPL",
        caption=caption,
        parse_mode="MarkdownV2",
        reply_markup=markup_photo if panel_url else None
    )

# ──────────────────────────────────────────────
#  شراء سيرفر إضافي بالنقاط (مع استرجاع عند الإلغاء)
# ──────────────────────────────────────────────

@bot.callback_query_handler(func=lambda call: call.data == "buy_server_slot")
def buy_server_slot(call):
    bot.answer_callback_query(call.id)
    users = load_users()
    settings = load_bot_settings()
    cost = settings.get('points_per_server', 10)
    for uname, data in users.items():
        if data.get('telegram_id') == call.from_user.id:
            pts = data.get('points', 0)
            if pts < cost:
                bot.send_message(call.message.chat.id,
                    f"❌ رصيدك غير كافٍ!\n\n"
                    f"💰 رصيدك: `{pts}` نقطة\n"
                    f"💸 المطلوب: `{cost}` نقطة\n\n"
                    f"استخدم رابط الإحالة 🔗 أو الأكواد 🎟️ للحصول على نقاط.",
                    parse_mode="Markdown")
                return
            new_pts, ok = deduct_points(uname, cost, "شراء سيرفر إضافي")
            if not ok:
                bot.send_message(call.message.chat.id, "❌ حدث خطأ أثناء خصم النقاط.")
                return
            _log_action("شراء سيرفر", admin_id=call.from_user.id,
                        details=f"خصم {cost} نقطة من {uname}")
            mk = types.InlineKeyboardMarkup(row_width=1)
            mk.add(ikb_button("❌ إلغاء واسترجاع النقاط", callback_data=f"cancel_buy_{uname}_{cost}", style="danger"))
            bot.send_message(call.message.chat.id,
                f"✅ تم خصم `{cost}` نقطة.\n💰 رصيدك المتبقي: `{new_pts}` نقطة\n\n"
                f"🖥️ الآن أنشئ سيرفرك الجديد:\nأرسل اسم المستخدم الجديد (بالإنجليزية):",
                parse_mode="Markdown", reply_markup=mk)
            msg = bot.send_message(call.message.chat.id, "اكتب اسم المستخدم:")
            bot.register_next_step_handler(msg, process_paid_username)
            return
    bot.send_message(call.message.chat.id, "❌ لم يتم العثور على حسابك.")

@bot.callback_query_handler(func=lambda call: call.data.startswith("cancel_buy_"))
def cancel_buy_server(call):
    """استرجاع النقاط عند إلغاء شراء السيرفر."""
    bot.answer_callback_query(call.id, "🔄 يتم استرجاع النقاط...")
    parts = call.data.split("_")
    if len(parts) < 4:
        return
    uname = parts[2]
    try:
        cost = int(parts[3])
    except ValueError:
        return
    users = load_users()
    if uname not in users:
        return
    new_pts = refund_points(uname, cost, "استرجاع إلغاء شراء سيرفر")
    _log_action("إلغاء شراء سيرفر", admin_id=call.from_user.id,
                details=f"استرجاع {cost} نقطة لـ {uname}")
    try:
        bot.edit_message_text(
            f"✅ تم إلغاء العملية واسترجاع `{cost}` نقطة.\n💰 رصيدك: `{new_pts}` نقطة.",
            call.message.chat.id, call.message.message_id, parse_mode="Markdown")
    except Exception:
        bot.send_message(call.message.chat.id,
            f"✅ تم إلغاء العملية واسترجاع `{cost}` نقطة.\n💰 رصيدك: `{new_pts}` نقطة.",
            parse_mode="Markdown")

def process_paid_username(message):
    if not enforce_subscription(message):
        return
    username = message.text.strip()
    if not username or not username.isalnum():
        bot.send_message(message.chat.id, "❌ اسم مستخدم غير صالح! استخدم أحرف وأرقام فقط.")
        return
    users = load_users()
    if username in users:
        bot.send_message(message.chat.id, "❌ اسم المستخدم هذا مأخوذ. اختر اسماً آخر:")
        msg = bot.send_message(message.chat.id, "اكتب اسم المستخدم:")
        bot.register_next_step_handler(msg, process_paid_username)
        return
    msg = bot.send_message(message.chat.id, f"👤 اسم المستخدم: `{username}`\n\nأرسل كلمة المرور:", parse_mode="Markdown")
    bot.register_next_step_handler(msg, lambda m: process_paid_password(m, username))

def process_paid_password(message, username):
    if not enforce_subscription(message):
        return
    password = message.text.strip()
    if len(password) < 6:
        bot.send_message(message.chat.id, "❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل.")
        return
    users = load_users()
    users[username] = {
        'password': hashlib.sha256(password.encode()).hexdigest(),
        'password_plain': password,
        'max_sessions': 999,
        'max_servers': 2,
        'points': 0,
        'main_file': 'main.py',
        'created': datetime.now().isoformat(),
        'expiry': (datetime.now() + timedelta(days=load_subscription_plans().get('free_trial', {}).get('days', 7))).isoformat(),
        'plan': 'free_trial',
        'expiry_notified': False,
        'telegram_id': message.from_user.id,
        'banned': False
    }
    save_users(users)
    os.makedirs(os.path.join(USERS_FOLDER, username), exist_ok=True)
    assigned_ip = assign_ip(username)
    sync_user_to_panel(username, password)
    _send_server_created(message.chat.id, message.from_user, username, password, assigned_ip)
    _notify_admin_log(
        f"🖥️ *تم شراء سيرفر إضافي بالنقاط*\n"
        f"👤 المستخدم: {user_ref(message.from_user)}\n"
        f"🔑 اسم الحساب: `{username}`",
        admin_id=message.from_user.id,
        markup=_chat_button(message.from_user.id)
    )

# ──────────────────────────────────────────────
#  الباقات
# ──────────────────────────────────────────────

@bot.message_handler(func=lambda m: m.text == "📦 الباقات")
def show_packages(message):
    if not enforce_subscription(message):
        return
    plans = load_subscription_plans()
    accounts = user_accounts_by_telegram(message.from_user.id)
    current_txt = ""
    if accounts:
        _, data = accounts[0]
        cur_plan_key = data.get('plan', 'free_trial')
        cur_plan_info = plans.get(cur_plan_key, plans['free_trial'])
        expiry = data.get('expiry')
        if expiry:
            try:
                remaining = (datetime.fromisoformat(expiry) - datetime.now()).days
                remaining_txt = f"{max(0, remaining)} يوم متبقي" if remaining >= 0 else "منتهية ⚠️"
            except Exception:
                remaining_txt = "-"
        else:
            remaining_txt = "بدون تاريخ انتهاء"
        current_txt = (
            f"📌 **باقتك الحالية:** {cur_plan_info.get('label', cur_plan_key)}\n"
            f"⏳ {remaining_txt}\n\n"
        )

    msg = (
        "📦 **الباقات المتاحة:**\n\n"
        f"{current_txt}"
        f"{format_plan_line('free_trial', plans['free_trial'])}\n\n"
        f"{format_plan_line('pro', plans['pro'])}\n\n"
        f"{format_plan_line('premium', plans['premium'])}\n\n"
        f"{format_plan_line('ultimate', plans['ultimate'])}\n\n"
        "للاشتراك في باقة مدفوعة اختر من الأزرار 👇"
    )
    mk = types.InlineKeyboardMarkup(row_width=1)
    mk.add(
        ikb_button(f"⭐ برو 7 أيام ({plans['pro'].get('price_stars', 0)} ⭐)", callback_data="sub_buy_pro", style="success"),
        ikb_button(f"💎 بريميوم 15 يوم ({plans['premium'].get('price_stars', 0)} ⭐)", callback_data="sub_buy_premium", style="success"),
        ikb_button(f"👑 ألتميت 30 يوم ({plans['ultimate'].get('price_stars', 0)} ⭐)", callback_data="sub_buy_ultimate", style="success")
    )
    bot.send_message(message.chat.id, msg, parse_mode="Markdown", reply_markup=mk)

@bot.callback_query_handler(func=lambda call: call.data in ("sub_buy_pro", "sub_buy_premium", "sub_buy_ultimate"))
def sub_buy_callback(call):
    bot.answer_callback_query(call.id)
    plan_map = {"sub_buy_pro": "pro", "sub_buy_premium": "premium", "sub_buy_ultimate": "ultimate"}
    plan_key = plan_map[call.data]
    plans = load_subscription_plans()
    info = plans.get(plan_key, {})
    contact = plans.get('payment_contact', '@V_9_X_9')
    contact_link = f"https://t.me/{contact.lstrip('@')}"
    msg = (
        f"💳 **الاشتراك في {info.get('label', plan_key)}**\n\n"
        f"⏳ المدة: {info.get('days', 0)} يوم\n"
        f"💵 السعر: {info.get('price_stars', 0)} نجمة ⭐\n\n"
        f"1️⃣ حوّل المبلغ إلى حساب الأدمن: `{contact}`\n"
        f"2️⃣ بعد إتمام التحويل اضغط زر **✅ تم الدفع** بالأسفل\n"
        f"3️⃣ انتظر تفعيل الأدمن لباقتك\n\n"
        "⚠️ الدفع يتم فقط عبر حساب الأدمن الموضح أعلاه."
    )
    mk = types.InlineKeyboardMarkup(row_width=1)
    mk.add(
        ikb_button("💬 تواصل مع الأدمن", url=contact_link, style="primary"),
        ikb_button("✅ تم الدفع", callback_data=f"sub_paid_{plan_key}", style="success"),
        ikb_button("❌ إلغاء", callback_data="sub_cancel", style="danger")
    )
    bot.send_message(call.message.chat.id, msg, parse_mode="Markdown", reply_markup=mk)

@bot.callback_query_handler(func=lambda call: call.data == "sub_cancel")
def sub_cancel_callback(call):
    bot.answer_callback_query(call.id, "تم الإلغاء")
    try:
        bot.edit_message_reply_markup(call.message.chat.id, call.message.message_id, reply_markup=None)
    except Exception:
        pass

@bot.callback_query_handler(func=lambda call: call.data in ("sub_paid_pro", "sub_paid_premium", "sub_paid_ultimate"))
def sub_paid_callback(call):
    bot.answer_callback_query(call.id, "✅ تم إرسال طلبك للأدمن")
    plan_map = {"sub_paid_pro": "pro", "sub_paid_premium": "premium", "sub_paid_ultimate": "ultimate"}
    plan_key = plan_map[call.data]
    plans = load_subscription_plans()
    info = plans.get(plan_key, {})

    pending = load_pending_subs()
    req_id = str(call.from_user.id) + "_" + str(int(datetime.now().timestamp()))
    pending[req_id] = {
        'telegram_id': call.from_user.id,
        'username': call.from_user.username or '',
        'plan': plan_key,
        'requested_at': datetime.now().isoformat()
    }
    save_pending_subs(pending)

    try:
        bot.edit_message_reply_markup(call.message.chat.id, call.message.message_id, reply_markup=None)
    except Exception:
        pass
    contact = plans.get('payment_contact', '@V_9_X_9')
    contact_link = f"https://t.me/{contact.lstrip('@')}"
    user_mk = types.InlineKeyboardMarkup(row_width=1)
    user_mk.add(ikb_button("💬 تواصل مع المطور", url=contact_link, style="primary"))
    bot.send_message(call.message.chat.id,
        "⏳ تم إرسال طلب اشتراكك للأدمن، سيتم تفعيل باقتك بعد التأكد من الدفع.\n"
        "للتواصل مع المطور اضغط الزر بالأسفل 👇",
        reply_markup=user_mk)

    mk = types.InlineKeyboardMarkup(row_width=2)
    mk.add(
        ikb_button("✅ تفعيل", callback_data=f"admin_sub_approve_{req_id}", style="success"),
        ikb_button("❌ رفض", callback_data=f"admin_sub_reject_{req_id}", style="danger")
    )
    mk.add(ikb_button("💬 فتح الشات مع المستخدم", url=f"https://t.me/user?id={call.from_user.id}", style="primary"))
    notify_text = (
        f"🧾 *طلب اشتراك جديد*\n"
        f"👤 المستخدم: {user_ref(call.from_user)}\n"
        f"📦 الباقة: {info.get('label', plan_key)}\n"
        f"💵 السعر: `{info.get('price_stars', 0)}` نجمة"
    )
    settings = load_bot_settings()
    admin_ids = set(settings.get('admin_list', []))
    admin_ids.add(ADMIN_ID)
    for aid in admin_ids:
        try:
            bot.send_message(aid, notify_text, parse_mode="Markdown", reply_markup=mk)
        except Exception:
            pass

# ──────────────────────────────────────────────
#  الإحالة والنقاط والمساعدة
# ──────────────────────────────────────────────

@bot.message_handler(func=lambda m: m.text == "🔗 إحالة")
def invite_link(message):
    if not enforce_subscription(message):
        return
    link = f"https://t.me/{(bot.get_me().username)}?start={message.from_user.id}"
    settings = load_bot_settings()
    invited_count = get_invited_count(message.from_user.id)
    remaining = max(0, REQUIRED_INVITES - invited_count)
    status = "✅ لقد أكملت شرط الدعوات ويمكنك إنشاء سيرفر!" if remaining == 0 else f"➕ متبقي عليك `{remaining}` دعوة لإنشاء أول سيرفر."
    bot.send_message(message.chat.id,
        f"🔗 **رابط الإحالة الخاص بك:**\n\nشارك هذا الرابط مع أصدقائك:\n`{link}`\n\n"
        f"📊 عدد دعواتك: `{invited_count}/{REQUIRED_INVITES}`\n{status}\n\n"
        f"💰 لكل شخص يشترك من خلالك ستحصل أيضاً على *{settings.get('points_per_invite', 1)} نقاط*.\n\n"
        f"🎁 يمكنك استبدال النقاط بزيادة عدد السيرفرات المتاحة لك.",
        parse_mode="Markdown")

@bot.message_handler(func=lambda m: m.text == "💰 شراء نقاط")
def buy_points(message):
    if not enforce_subscription(message):
        return
    settings = load_bot_settings()
    bot.send_message(message.chat.id,
        f"💫 **شراء النقاط:**\n\n"
        f"🔹 {settings.get('points_per_server', 10)} نقطة = سيرفر إضافي\n"
        f"🔹 للحصول على نقاط مجانية استخدم زر الإحالة 🔗\n\n"
        f"📩 للشراء تواصل مع المطور:",
        parse_mode="Markdown",
        reply_markup=types.InlineKeyboardMarkup().add(
            ikb_button("👨‍💻 تواصل مع المطور", url=settings.get('dev_user', 'https://t.me/I_tt_6'), style="primary")
        )
    )

@bot.message_handler(func=lambda m: m.text == "❓ مساعدة")
def help_msg(message):
    if not enforce_subscription(message):
        return
    settings = load_bot_settings()
    bot.send_message(message.chat.id,
        "❓ **المساعدة:**\n\n"
        "🚀 *إنشاء سيرفر* — أنشئ حساباً للوحة التحكم\n"
        "👤 *ملفي الشخصي* — عرض بياناتك وكلمة مرورك\n"
        "🔗 *إحالة* — احصل على نقاط بدعوة أصدقائك\n"
        "💫 *شراء نقاط* — زيادة عدد سيرفراتك\n"
        "🎟️ *استخدام كود* — استخدم كود للحصول على نقاط\n"
        "📦 *الباقات* — تعرّف على باقاتنا واشترك في باقة مدفوعة\n\n"
        "🌐 رابط لوحة التحكم:",
        parse_mode="Markdown",
        reply_markup=types.InlineKeyboardMarkup().add(
            ikb_button("📢 قناة المطور", url=settings.get('dev_channel', 'https://t.me/ul2fg'), style="primary")
        )
    )

@bot.message_handler(func=lambda m: m.text == "🎁 استخدام كود")
def use_code(message):
    if not enforce_subscription(message):
        return
    msg = bot.send_message(message.chat.id, "🎟️ أرسل الكود الذي تريد استخدامه:")
    bot.register_next_step_handler(msg, process_code)

def process_code(message):
    if not enforce_subscription(message):
        return
    code_input = message.text.strip()
    settings = load_bot_settings()
    codes = settings.get('codes', {})
    if code_input not in codes:
        bot.send_message(message.chat.id, "❌ الكود غير صحيح أو منتهي الصلاحية.")
        return
    code_data = codes[code_input]
    if code_data.get('uses', 0) <= 0:
        bot.send_message(message.chat.id, "❌ هذا الكود نفدت استخداماته.")
        return
    used_by = code_data.get('used_by', [])
    user_id = message.from_user.id
    used_by_ids = [int(x) for x in used_by]
    if user_id in used_by_ids:
        bot.send_message(message.chat.id, "❌ لقد استخدمت هذا الكود من قبل.")
        return
    users = load_users()
    found = False
    target_uname = None
    for u, data in users.items():
        if data.get('telegram_id') == user_id:
            target_uname = u
            found = True
            break
    # Auto-create account if user doesn't have one
    if not found:
        import random
        tg = message.from_user
        base_uname = (tg.username or f"user_{tg.id}").replace('-', '_')[:30]
        uname = base_uname
        counter = 1
        while uname in users:
            uname = f"{base_uname}_{counter}"
            counter += 1
        password = hashlib.md5(str(tg.id).encode()).hexdigest()[:12]
        users[uname] = {
            'password': hashlib.sha256(password.encode()).hexdigest(),
            'password_plain': password,
            'max_sessions': 999,
            'max_servers': 2,
            'points': 0,
            'main_file': 'main.py',
            'created': datetime.now().isoformat(),
            'expiry': (datetime.now() + timedelta(days=load_subscription_plans().get('free_trial', {}).get('days', 7))).isoformat(),
            'plan': 'free_trial',
            'expiry_notified': False,
            'telegram_id': tg.id,
            'banned': False,
            'display_name': tg.first_name or uname,
        }
        os.makedirs(os.path.join(USERS_FOLDER, uname), exist_ok=True)
        assigned_ip = assign_ip(uname)
        target_uname = uname
        save_users(users)
        sync_user_to_panel(uname, password, display_name=tg.first_name or uname)
        _send_server_created(message.chat.id, tg, uname, password, assigned_ip)
        _notify_admin_log(
            f"🖥️ *تم إنشاء حساب تلقائي عبر كود*\n"
            f"👤 المستخدم: {user_ref(tg)}\n"
            f"🔑 اسم الحساب: `{uname}`",
            admin_id=tg.id,
            markup=_chat_button(tg.id)
        )
        found = True

    pts = code_data.get('points', 0)
    users[target_uname]['points'] = users[target_uname].get('points', 0) + pts
    save_users(users)
    codes[code_input]['uses'] = codes[code_input].get('uses', 0) - 1
    codes[code_input].setdefault('used_by', []).append(user_id)
    settings['codes'] = codes
    save_bot_settings(settings)
    bot.send_message(message.chat.id, f"✅ تم استخدام الكود بنجاح!\n💰 حصلت على *{pts} نقطة*!\n🔹 رصيدك الآن: *{users[target_uname]['points']} نقطة*", parse_mode="Markdown")
    _notify_admin_log(
        f"🎟️ *تم استخدام كود*\n"
        f"👤 المستخدم: {user_ref(message.from_user)}\n"
        f"🎁 الكود: `{code_input}`\n"
        f"💰 النقاط الممنوحة: {pts}",
        admin_id=message.from_user.id,
        markup=_chat_button(message.from_user.id)
    )

@bot.message_handler(func=lambda m: m.text == "📊 سيرفراتي")
def my_servers(message):
    if not enforce_subscription(message):
        return
    procs = load_processes()
    users = load_users()
    uname = None
    for u, data in users.items():
        if data.get('telegram_id') == message.from_user.id:
            uname = u
            break

    if not uname:
        bot.send_message(message.chat.id, "❌ سجل أولاً.")
        return

    user_procs = [p for p in procs.values() if p.get('username') == uname]
    if not user_procs:
        bot.send_message(message.chat.id, "📭 ليس لديك سيرفرات شغالة حالياً.")
        return

    msg = "📊 **سيرفراتك الشغالة:**\n\n"
    for p in user_procs:
        msg += f"🔹 ملف: `{p.get('filename')}`\n"
        msg += f"🔹 PID: `{p.get('pid')}`\n"
        msg += f"🔹 الحالة: `Running`\n"
        msg += f"🔹 الوقت: `{p.get('start_time', '')[:19]}`\n\n"
    bot.send_message(message.chat.id, msg, parse_mode="Markdown")

# ──────────────────────────────────────────────
#  أزرار المطور
# ──────────────────────────────────────────────

@bot.message_handler(func=lambda m: m.text == "📢 قناة المطور")
def dev_channel_btn(message):
    if not enforce_subscription(message):
        return
    bot.send_message(message.chat.id, "📢 قناة المطور الرسمية:",
        reply_markup=types.InlineKeyboardMarkup().add(
            ikb_button("📢 انضم للقناة", url="https://t.me/ul2fg", style="success")
        ))

@bot.message_handler(func=lambda m: m.text == "👨‍💻 المطور")
def dev_user_btn(message):
    if not enforce_subscription(message):
        return
    bot.send_message(message.chat.id, "👨‍💻 مطور البوت:",
        reply_markup=types.InlineKeyboardMarkup().add(
            ikb_button("💬 تواصل مع المطور", url="https://t.me/I_tt_6", style="primary")
        ))

# ──────────────────────────────────────────────
#  التحقق من الاشتراك
# ──────────────────────────────────────────────

@bot.callback_query_handler(func=lambda call: call.data == "check_sub_verify")
def check_sub_verify(call):
    bot.answer_callback_query(call.id)
    settings = load_bot_settings()
    channel = settings.get('force_channel', '').strip()
    subscribed = False
    if not channel:
        subscribed = True
    else:
        try:
            member = bot.get_chat_member(channel, call.from_user.id)
            subscribed = member.status in ['member', 'administrator', 'creator']
        except Exception:
            subscribed = True

    if not subscribed:
        chan_link = channel if channel.startswith('http') else f"https://t.me/{channel.lstrip('@')}"
        sep = "\u200B\n"
        prompt = (
            ">❌ لم يتم التحقق من اشتراكك بعد\\!\n" + sep +
            ">تأكد أنك اشتركت في القناة ثم اضغط التحقق مجدداً 👇"
        )
        mk = types.InlineKeyboardMarkup(row_width=1)
        mk.add(
            ikb_button("🔔 اشترك في القناة الآن", url=chan_link, style="success"),
            ikb_button("✅ تحققت من الاشتراك", callback_data="check_sub_verify", style="primary")
        )
        try:
            bot.edit_message_text(prompt, call.message.chat.id, call.message.message_id,
                                  parse_mode="MarkdownV2", reply_markup=mk)
        except Exception:
            bot.send_message(call.message.chat.id, prompt, parse_mode="MarkdownV2", reply_markup=mk)
        return

    try:
        bot.delete_message(call.message.chat.id, call.message.message_id)
    except Exception:
        pass

    sep = "\u200B\n"
    welcome_caption = (
        ">أهـلاً بـك فـي بـوت ELMODMEN VPS\n" + sep +
        ">هنـا تجـد سيـرفرات VPS بلـغـه بـايثـون\n" + sep +
        ">مميـزاتـنا  :\n" + sep +
        ">عـزل آمـن بيـن السـيرفـرات\n" + sep +
        ">حـمايـه قـويه ضـد الهجـمات\n" + sep +
        ">سـهـوله التحـكم فـي ملفـاتك\n" + sep +
        ">اسـتقـرار النـظام الـدائــم\n" + sep +
        ">مـراقـبه الشبـكه و حـمايه المـلفات من أي هجـمات\n" + sep +
        ">عـمل دائـم بـدون تـوقف أبـداً\n" + sep +
        ">*قـم بـالبــدء الآن نحـو القـمه*"
    )
    bot.send_photo(
        call.message.chat.id,
        photo="https://ibb.co/B202WyPL",
        caption=welcome_caption,
        parse_mode="MarkdownV2",
        reply_markup=main_keyboard(call.from_user.id)
    )

# ═══════════════════════════════════════════════
#  لوحة الأدمن
# ═══════════════════════════════════════════════

@bot.message_handler(func=lambda m: m.text == "🛠️ لوحة الأدمن" and is_admin(m.from_user.id))
def admin_panel(message):
    bot.send_message(message.chat.id, "👑 مرحباً بك في لوحة تحكم الأدمن:", reply_markup=admin_keyboard())

@bot.callback_query_handler(func=lambda call: call.data.startswith('admin_'))
def admin_callbacks(call):
    if not is_admin(call.from_user.id):
        bot.answer_callback_query(call.id, "⛔ ليس لديك صلاحية!")
        return
    bot.answer_callback_query(call.id)

    # ─── الإحصائيات ───
    if call.data == "admin_stats":
        users = load_users()
        procs = load_processes()
        settings = load_bot_settings()
        admins = settings.get('admin_list', [])
        channel = settings.get('force_channel', 'غير محددة')
        total_points = sum(d.get('points', 0) for d in users.values())
        active_users = sum(1 for d in users.values() if not d.get('banned'))
        banned_users = sum(1 for d in users.values() if d.get('banned'))
        total_servers = len(users)
        total_referrals = len(load_referrals())
        pending_count = len(load_pending_subs())
        codes_count = len(settings.get('codes', {}))
        msg = (
            f"📊 **إحصائيات النظام:**\n\n"
            f"👥 عدد المستخدمين: `{len(users)}`\n"
            f"  🟢 نشط: `{active_users}` | 🔴 محظور: `{banned_users}`\n"
            f"🖥️ السيرفرات المسجلة: `{total_servers}`\n"
            f"⚙️ العمليات النشطة: `{len(procs)}`\n"
            f"💰 إجمالي النقاط: `{total_points}` نقطة\n"
            f"🔗 إجمالي الإحالات: `{total_referrals}`\n"
            f"🎟️ الأكواد النشطة: `{codes_count}`\n"
            f"🧾 طلبات الدفع المعلّقة: `{pending_count}`\n"
            f"👑 الأدمنز: `{len(admins) + 1}`\n"
            f"📢 قناة الاشتراك: `{channel}`\n"
            f"💰 نقاط/سيرفر: `{settings.get('points_per_server', 10)}`\n"
            f"🔗 نقاط/إحالة: `{settings.get('points_per_invite', 1)}`"
        )
        bot.send_message(call.message.chat.id, msg, parse_mode="Markdown")

    # ─── حظر ───
    elif call.data == "admin_ban":
        msg = bot.send_message(call.message.chat.id, "🚫 أرسل اسم المستخدم أو Telegram ID لحظره:")
        bot.register_next_step_handler(msg, admin_ban_user)

    # ─── فك حظر ───
    elif call.data == "admin_unban":
        msg = bot.send_message(call.message.chat.id, "✅ أرسل اسم المستخدم أو Telegram ID لفك حظره:")
        bot.register_next_step_handler(msg, admin_unban_user)

    # ─── إضافة أدمن ───
    elif call.data == "admin_add_admin":
        msg = bot.send_message(call.message.chat.id, "➕ أرسل معرف التليجرام (ID) للمستخدم الجديد الأدمن:")
        bot.register_next_step_handler(msg, admin_add_admin_step)

    # ─── حذف أدمن ───
    elif call.data == "admin_del_admin":
        settings = load_bot_settings()
        admins = settings.get('admin_list', [])
        if not admins:
            bot.send_message(call.message.chat.id, "❌ لا يوجد أدمنز مضافون حالياً.")
        else:
            bot.send_message(call.message.chat.id, f"👑 قائمة الأدمنز:\n" + "\n".join([f"• `{a}`" for a in admins]) + "\n\n➖ أرسل ID الأدمن لحذفه:", parse_mode="Markdown")
            msg = bot.send_message(call.message.chat.id, "أرسل ID:")
            bot.register_next_step_handler(msg, admin_del_admin_step)

    # ─── إضافة قناة إجبارية ───
    elif call.data == "admin_add_channel":
        msg = bot.send_message(call.message.chat.id, "📢 أرسل معرف القناة (مثال: @channel_name):")
        bot.register_next_step_handler(msg, admin_add_channel_step)

    # ─── حذف قناة إجبارية ───
    elif call.data == "admin_del_channel":
        settings = load_bot_settings()
        current = settings.get('force_channel', '')
        if current:
            mk = types.InlineKeyboardMarkup(row_width=1)
            mk.add(
                ikb_button("🗑️ نعم، احذفها", callback_data="admin_confirm_del_channel", style="danger"),
                ikb_button("❌ لا، إلغاء", callback_data="admin_cancel_del_channel", style="primary")
            )
            bot.send_message(call.message.chat.id,
                f"📢 القناة الحالية: `{current}`\n\nهل تريد حذف هذه القناة من الاشتراك الإجباري؟",
                parse_mode="Markdown", reply_markup=mk)
        else:
            bot.send_message(call.message.chat.id, "❌ لا توجد قناة اشتراك إجباري مضافة.")

    elif call.data == "admin_confirm_del_channel":
        settings = load_bot_settings()
        current = settings.get('force_channel', '')
        if current:
            settings['force_channel'] = ''
            save_bot_settings(settings)
            _log_action("حذف قناة إجبارية", admin_id=call.from_user.id, details=current)
            try:
                bot.edit_message_text(f"✅ تم حذف قناة الاشتراك الإجباري: `{current}`",
                    call.message.chat.id, call.message.message_id, parse_mode="Markdown")
            except Exception:
                bot.send_message(call.message.chat.id, f"✅ تم حذف قناة الاشتراك الإجباري: `{current}`", parse_mode="Markdown")
        else:
            bot.send_message(call.message.chat.id, "❌ لا توجد قناة مضافة.")

    elif call.data == "admin_cancel_del_channel":
        try:
            bot.edit_message_text("🚫 تم إلغاء الحذف.",
                call.message.chat.id, call.message.message_id)
        except Exception:
            bot.send_message(call.message.chat.id, "🚫 تم إلغاء الحذف.")

    # ─── إضافة كود ───
    elif call.data == "admin_add_code":
        msg = bot.send_message(call.message.chat.id, "🎟️ أرسل اسم الكود:")
        bot.register_next_step_handler(msg, admin_code_name_step)

    # ─── قائمة الأكواد ───
    elif call.data == "admin_list_codes":
        settings = load_bot_settings()
        codes = settings.get('codes', {})
        if not codes:
            bot.send_message(call.message.chat.id, "❌ لا توجد أكواد مضافة.")
        else:
            msg = "📋 **قائمة الأكواد:**\n\n"
            for code, data in codes.items():
                msg += f"🎟️ `{code}` — {data.get('uses', 0)} استخدام — {data.get('points', 0)} نقطة\n"
            bot.send_message(call.message.chat.id, msg, parse_mode="Markdown")

    # ─── قائمة السيرفرات ───
    elif call.data == "admin_list_servers":
        users = load_users()
        if not users:
            bot.send_message(call.message.chat.id, "❌ لا يوجد مستخدمون.")
        else:
            msg = "🖥️ **قائمة السيرفرات والمستخدمين:**\n\n"
            for uname, data in users.items():
                status = "🔴 محظور" if data.get('banned') else "🟢 نشط"
                password = data.get('password_plain', '🔒 مشفرة')
                msg += (f"👤 `{uname}` {status}\n"
                        f"   🔑 كلمة المرور: `{password}`\n"
                        f"   💰 النقاط: `{data.get('points', 0)}`\n"
                        f"   🖥️ السيرفرات: `{data.get('max_servers', 1)}`\n\n")
            for chunk in [msg[i:i+3500] for i in range(0, len(msg), 3500)]:
                bot.send_message(call.message.chat.id, chunk, parse_mode="Markdown")

    # ─── إضافة نقاط ───
    elif call.data == "admin_add_points":
        msg = bot.send_message(call.message.chat.id, "💰 أرسل اسم المستخدم أو Telegram ID لإضافة نقاط:")
        bot.register_next_step_handler(msg, admin_add_points_user_step)

    # ─── خصم نقاط ───
    elif call.data == "admin_del_points":
        msg = bot.send_message(call.message.chat.id, "➖ أرسل اسم المستخدم أو Telegram ID لخصم نقاط:")
        bot.register_next_step_handler(msg, admin_del_points_user_step)

    # ─── فحص مستخدم ───
    elif call.data == "admin_check_user":
        msg = bot.send_message(call.message.chat.id, "🔍 أرسل اسم المستخدم أو Telegram ID لفحصه:")
        bot.register_next_step_handler(msg, admin_check_user_step)

    # ─── تكلفة السيرفر ───
    elif call.data == "admin_set_server_cost":
        settings = load_bot_settings()
        current_cost = settings.get('points_per_server', 10)
        msg = bot.send_message(call.message.chat.id,
            f"⚙️ **تكلفة السيرفر الإضافي الحالية:** `{current_cost}` نقطة\n\nأرسل العدد الجديد:",
            parse_mode="Markdown")
        bot.register_next_step_handler(msg, admin_set_server_cost_step)

    # ─── لينك اللوحة ───
    elif call.data == "admin_set_panel_url":
        settings = load_bot_settings()
        current_url = settings.get('panel_url', 'غير محدد')
        msg = bot.send_message(call.message.chat.id,
            f"🔗 **لينك اللوحة الحالي:** `{current_url}`\n\nأرسل اللينك الجديد:",
            parse_mode="Markdown")
        bot.register_next_step_handler(msg, admin_set_panel_url_step)

    # ─── نقاط الإحالة ───
    elif call.data == "admin_set_invite_points":
        settings = load_bot_settings()
        current = settings.get('points_per_invite', 1)
        msg = bot.send_message(call.message.chat.id,
            f"🔗 **نقاط الإحالة الحالية:** `{current}` نقطة لكل دعوة\n\nأرسل العدد الجديد:",
            parse_mode="Markdown")
        bot.register_next_step_handler(msg, admin_set_invite_points_step)

    # ─── إعدادات الباقات ───
    elif call.data == "admin_sub_settings":
        plans = load_subscription_plans()
        msg = (
            "📦 **إعدادات الباقات الحالية:**\n\n"
            f"{format_plan_line('free_trial', plans['free_trial'])}\n\n"
            f"{format_plan_line('pro', plans['pro'])}\n\n"
            f"{format_plan_line('premium', plans['premium'])}\n\n"
            f"💬 حساب الدفع: `{plans.get('payment_contact', '@V_9_X_9')}`\n\n"
            "اختر ما تريد تعديله 👇"
        )
        mk = types.InlineKeyboardMarkup(row_width=2)
        mk.add(
            ikb_button("⏳ مدة البرو", callback_data="admin_sub_edit_pro_days", style="primary"),
            ikb_button("💵 سعر البرو", callback_data="admin_sub_edit_pro_price", style="primary")
        )
        mk.add(
            ikb_button("⏳ مدة البريميوم", callback_data="admin_sub_edit_premium_days", style="primary"),
            ikb_button("💵 سعر البريميوم", callback_data="admin_sub_edit_premium_price", style="primary")
        )
        mk.add(
            ikb_button("⏳ مدة الألتميت", callback_data="admin_sub_edit_ultimate_days", style="primary"),
            ikb_button("💵 سعر الألتميت", callback_data="admin_sub_edit_ultimate_price", style="primary")
        )
        mk.add(
            ikb_button("🆓 مدة المجانية", callback_data="admin_sub_edit_free_days", style="primary"),
            ikb_button("💬 حساب الدفع", callback_data="admin_sub_edit_contact", style="primary")
        )
        bot.send_message(call.message.chat.id, msg, parse_mode="Markdown", reply_markup=mk)

    elif call.data in (
        "admin_sub_edit_pro_days", "admin_sub_edit_pro_price",
        "admin_sub_edit_premium_days", "admin_sub_edit_premium_price",
        "admin_sub_edit_ultimate_days", "admin_sub_edit_ultimate_price",
        "admin_sub_edit_free_days", "admin_sub_edit_contact"
    ):
        prompts = {
            "admin_sub_edit_pro_days":      ("مدة باقة برو (بالأيام)", 'pro', 'days'),
            "admin_sub_edit_pro_price":     ("سعر باقة برو (نجمة)", 'pro', 'price_stars'),
            "admin_sub_edit_premium_days":  ("مدة باقة بريميوم (بالأيام)", 'premium', 'days'),
            "admin_sub_edit_premium_price": ("سعر باقة بريميوم (نجمة)", 'premium', 'price_stars'),
            "admin_sub_edit_ultimate_days": ("مدة باقة ألتميت (بالأيام)", 'ultimate', 'days'),
            "admin_sub_edit_ultimate_price":("سعر باقة ألتميت (نجمة)", 'ultimate', 'price_stars'),
            "admin_sub_edit_free_days":     ("مدة الباقة المجانية (بالأيام)", 'free_trial', 'days'),
        }
        if call.data == "admin_sub_edit_contact":
            msg = bot.send_message(call.message.chat.id,
                "💬 أرسل يوزر تيليجرام حساب استلام الدفع (مثال: @V_9_X_9):")
            bot.register_next_step_handler(msg, admin_sub_edit_contact_step)
        else:
            label, plan_key, field = prompts[call.data]
            plans = load_subscription_plans()
            current = plans.get(plan_key, {}).get(field, 0)
            msg = bot.send_message(call.message.chat.id,
                f"✏️ **{label}**\nالقيمة الحالية: `{current}`\n\nأرسل القيمة الجديدة:",
                parse_mode="Markdown")
            bot.register_next_step_handler(msg, lambda m: admin_sub_edit_value_step(m, plan_key, field, label))

    # ─── طلبات الدفع المعلّقة ───
    elif call.data == "admin_pending_subs":
        pending = load_pending_subs()
        if not pending:
            bot.send_message(call.message.chat.id, "✅ لا توجد طلبات دفع معلّقة حالياً.")
        else:
            plans = load_subscription_plans()
            for req_id, req in pending.items():
                plan_info = plans.get(req.get('plan'), {})
                msg = (
                    f"🧾 **طلب اشتراك معلّق**\n\n"
                    f"👤 المستخدم: `{req.get('telegram_id')}`"
                    + (f" (@{req.get('username')})" if req.get('username') else "") + "\n"
                    f"📦 الباقة: {plan_info.get('label', req.get('plan'))}\n"
                    f"💵 السعر: `{plan_info.get('price_stars', 0)}` نجمة\n"
                    f"🕐 وقت الطلب: `{req.get('requested_at', '-')[:19]}`"
                )
                mk = types.InlineKeyboardMarkup(row_width=2)
                mk.add(
                    ikb_button("✅ تفعيل", callback_data=f"admin_sub_approve_{req_id}", style="success"),
                    ikb_button("❌ رفض", callback_data=f"admin_sub_reject_{req_id}", style="danger")
                )
                bot.send_message(call.message.chat.id, msg, parse_mode="Markdown", reply_markup=mk)

    # ─── تفعيل/رفض طلب اشتراك ───
    elif call.data.startswith("admin_sub_approve_") or call.data.startswith("admin_sub_reject_"):
        is_approve = call.data.startswith("admin_sub_approve_")
        req_id = call.data.split("_", 3)[3] if is_approve else call.data.split("_", 3)[3]
        pending = load_pending_subs()
        req = pending.get(req_id)
        if not req:
            bot.send_message(call.message.chat.id, "❌ هذا الطلب لم يعد موجوداً.")
        else:
            tg_id = req.get('telegram_id')
            plan_key = req.get('plan')
            plans = load_subscription_plans()
            plan_info = plans.get(plan_key, {})
            if is_approve:
                ok, count = activate_subscription_for_telegram(tg_id, plan_key)
                if ok:
                    # تحويل النجوم من المستخدم إلى المطور
                    price = plan_info.get('price_stars', 0)
                    if price > 0:
                        users_all = load_users()
                        # اخصم من المشتري
                        buyer_found = False
                        admin_username = None
                        for uname, data in users_all.items():
                            if data.get('telegram_id') == tg_id:
                                old = data.get('points', 0)
                                data['points'] = max(0, old - price)
                                buyer_found = True
                            if data.get('telegram_id') == ADMIN_ID:
                                admin_username = uname
                        if buyer_found:
                            save_users(users_all)
                            # أضف للمطور
                            if admin_username:
                                add_points(admin_username, price, f"استلام نجوم من اشتراك {plan_key}")
                            _log_action("تحويل نجوم", admin_id=ADMIN_ID,
                                        details=f"تحويل {price} نجمة من {tg_id} إلى المطور")
                    price_line = f"\n💰 تم خصم `{price}` نجمة من رصيدك وتحويلها للمطور." if price > 0 else "\n🆓 الباقة مجانية"
                    try:
                        bot.send_message(tg_id,
                            f"🎉 **تم تفعيل اشتراكك بنجاح!**\n\n"
                            f"📦 الباقة: {plan_info.get('label', plan_key)}\n"
                            f"⏳ المدة: {plan_info.get('days', 0)} يوم"
                            f"{price_line}",
                            parse_mode="Markdown")
                    except Exception:
                        pass
                    bot.send_message(call.message.chat.id, f"✅ تم تفعيل الباقة لعدد `{count}` حساب.", parse_mode="Markdown")
                    _log_action("تفعيل اشتراك", admin_id=call.from_user.id,
                                details=f"تفعيل {plan_key} لـ {tg_id}")
                else:
                    bot.send_message(call.message.chat.id, "⚠️ لا يوجد حساب مرتبط بهذا التليجرام.")
            else:
                try:
                    bot.send_message(tg_id,
                        "❌ لم يتم تأكيد عملية الدفع.\nتواصل مع الأدمن.")
                except Exception:
                    pass
                bot.send_message(call.message.chat.id, "🚫 تم رفض الطلب.")
                _log_action("رفض اشتراك", admin_id=call.from_user.id,
                            details=f"رفض طلب {tg_id}")
            pending.pop(req_id, None)
            save_pending_subs(pending)
            try:
                bot.edit_message_reply_markup(call.message.chat.id, call.message.message_id, reply_markup=None)
            except Exception:
                pass

    # ─── تعديل عدد سيرفرات مستخدم ───
    elif call.data == "admin_edit_max_servers":
        msg = bot.send_message(call.message.chat.id, "✏️ أرسل اسم المستخدم أو Telegram ID لتعديل سيرفراته:")
        bot.register_next_step_handler(msg, admin_edit_max_servers_step)

    # ─── حذف مستخدم ───
    elif call.data == "admin_delete_user":
        msg = bot.send_message(call.message.chat.id, "🗑️ أرسل اسم المستخدم أو Telegram ID للحذف نهائياً:")
        bot.register_next_step_handler(msg, admin_delete_user_step)

    # ─── بث رسالة ───
    elif call.data == "admin_broadcast":
        msg = bot.send_message(call.message.chat.id,
            "📢 أرسل الرسالة التي تريد بثها لجميع المستخدمين:\n\n"
            "💡 يمكنك استخدام Markdown في الرسالة.\n"
            "💡 أرسل /cancel لإلغاء البث.")
        bot.register_next_step_handler(msg, admin_broadcast_step)

    # ─── سجل العمليات ───
    elif call.data == "admin_activity_log":
        log = load_json_file(ACTIVITY_LOG_FILE, [])
        if not log:
            bot.send_message(call.message.chat.id, "📜 السجل فارغ حالياً.")
        else:
            recent = log[-10:]
            msg = "📜 **آخر 10 عمليات:**\n\n"
            for entry in reversed(recent):
                t = entry.get('time', '')[:16]
                tp = entry.get('type', '-')
                det = entry.get('details', '')[:100]
                admin = entry.get('admin', '-')
                msg += f"🕐 `{t}`\n📌 {tp}\n👤 الأدمن: `{admin}`\n📝 {det}\n\n"
            bot.send_message(call.message.chat.id, msg, parse_mode="Markdown")

# ═══════════════════════════════════════════════
#  خطوات الأدمن
# ═══════════════════════════════════════════════

def admin_ban_user(message):
    query = message.text.strip()
    uname, data = find_user_by_query(query)
    if not uname:
        bot.send_message(message.chat.id, "❌ المستخدم غير موجود.\n💡 أرسل اسم المستخدم أو Telegram ID.")
        return
    users = load_users()
    users[uname]['banned'] = True
    save_users(users)
    _log_action("حظر مستخدم", admin_id=message.from_user.id, details=f"{uname} (TG: {data.get('telegram_id', '-')})")
    bot.send_message(message.chat.id, f"✅ تم حظر `{uname}` من البوت.", parse_mode="Markdown")
    try:
        tid = data.get('telegram_id')
        if tid:
            bot.send_message(tid, "🚫 تم حظرك من البوت.")
    except Exception:
        pass

def admin_unban_user(message):
    query = message.text.strip()
    uname, data = find_user_by_query(query)
    if not uname:
        bot.send_message(message.chat.id, "❌ المستخدم غير موجود.\n💡 أرسل اسم المستخدم أو Telegram ID.")
        return
    users = load_users()
    users[uname]['banned'] = False
    save_users(users)
    _log_action("فك حظر", admin_id=message.from_user.id, details=f"{uname} (TG: {data.get('telegram_id', '-')})")
    bot.send_message(message.chat.id, f"✅ تم فك حظر `{uname}`.", parse_mode="Markdown")
    try:
        tid = data.get('telegram_id')
        if tid:
            bot.send_message(tid, "✅ تم فك حظرك من البوت!")
    except Exception:
        pass

def admin_add_admin_step(message):
    try:
        new_id = int(message.text.strip())
        settings = load_bot_settings()
        admins = settings.get('admin_list', [])
        if new_id not in admins:
            admins.append(new_id)
            settings['admin_list'] = admins
            save_bot_settings(settings)
            _log_action("إضافة أدمن", admin_id=message.from_user.id, details=str(new_id))
            bot.send_message(message.chat.id, f"✅ تم إضافة `{new_id}` كأدمن.", parse_mode="Markdown")
        else:
            bot.send_message(message.chat.id, "❌ هذا المستخدم أدمن بالفعل.")
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل ID رقمي صحيح.")

def admin_del_admin_step(message):
    try:
        del_id = int(message.text.strip())
        settings = load_bot_settings()
        admins = settings.get('admin_list', [])
        if del_id in admins:
            admins.remove(del_id)
            settings['admin_list'] = admins
            save_bot_settings(settings)
            _log_action("حذف أدمن", admin_id=message.from_user.id, details=str(del_id))
            bot.send_message(message.chat.id, f"✅ تم حذف `{del_id}` من الأدمنز.", parse_mode="Markdown")
        else:
            bot.send_message(message.chat.id, "❌ هذا المستخدم ليس أدمن.")
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل ID رقمي صحيح.")

def admin_add_channel_step(message):
    channel = message.text.strip()
    if not channel.startswith('@'):
        channel = '@' + channel
    settings = load_bot_settings()
    settings['force_channel'] = channel
    save_bot_settings(settings)
    _log_action("إضافة قناة إجبارية", admin_id=message.from_user.id, details=channel)
    bot.send_message(message.chat.id, f"✅ تم تعيين قناة الاشتراك الإجباري: `{channel}`", parse_mode="Markdown")

def admin_code_name_step(message):
    code_name = message.text.strip()
    msg = bot.send_message(message.chat.id, f"🎟️ الكود: `{code_name}`\n\nأرسل عدد الاستخدامات المسموحة:", parse_mode="Markdown")
    bot.register_next_step_handler(msg, lambda m: admin_code_uses_step(m, code_name))

def admin_code_uses_step(message, code_name):
    try:
        uses = int(message.text.strip())
        if uses <= 0:
            bot.send_message(message.chat.id, "❌ أرسل رقماً أكبر من صفر.")
            return
        msg = bot.send_message(message.chat.id, "💰 أرسل عدد النقاط التي يحصل عليها المستخدم:")
        bot.register_next_step_handler(msg, lambda m: admin_code_points_step(m, code_name, uses))
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

def admin_code_points_step(message, code_name, uses):
    try:
        points = int(message.text.strip())
        if points <= 0:
            bot.send_message(message.chat.id, "❌ أرسل رقماً أكبر من صفر.")
            return
        settings = load_bot_settings()
        if 'codes' not in settings:
            settings['codes'] = {}
        settings['codes'][code_name] = {
            'uses': uses,
            'points': points,
            'used_by': []
        }
        save_bot_settings(settings)
        _log_action("إضافة كود", admin_id=message.from_user.id,
                    details=f"كود: {code_name}, استخدامات: {uses}, نقاط: {points}")
        bot.send_message(message.chat.id,
            f"✅ **تم إضافة الكود بنجاح!**\n\n"
            f"🎟️ الكود: `{code_name}`\n"
            f"🔢 الاستخدامات: `{uses}`\n"
            f"💰 النقاط: `{points}`\n\n"
            f"💡 الآن يمكنك مشاركة الكود مع المستخدمين.",
            parse_mode="Markdown")
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

def admin_del_points_user_step(message):
    query = message.text.strip()
    uname, data = find_user_by_query(query)
    if not uname:
        bot.send_message(message.chat.id, "❌ المستخدم غير موجود.\n💡 أرسل اسم المستخدم أو Telegram ID.")
        return
    users = load_users()
    current_pts = users[uname].get('points', 0)
    msg = bot.send_message(message.chat.id,
        f"➖ رصيد `{uname}` الحالي: *{current_pts}* نقطة\n\nكم نقطة تريد خصمها؟",
        parse_mode="Markdown")
    bot.register_next_step_handler(msg, lambda m: admin_del_points_amount_step(m, uname))

def admin_del_points_amount_step(message, uname):
    try:
        pts = int(message.text.strip())
        if pts <= 0:
            bot.send_message(message.chat.id, "❌ أرسل رقماً أكبر من صفر.")
            return
        new_pts, ok = deduct_points(uname, pts, f"خصم من الأدمن")
        if not ok:
            bot.send_message(message.chat.id, "❌ المستخدم غير موجود.")
            return
        old_pts = new_pts + pts
        _log_action("خصم نقاط", admin_id=message.from_user.id,
                    details=f"خصم {pts} نقطة من {uname}")
        bot.send_message(message.chat.id,
            f"✅ تم خصم `{pts}` نقطة من `{uname}`.\n💰 كان: *{old_pts}* | الآن: *{new_pts}* نقطة",
            parse_mode="Markdown")
        try:
            tid = users.get(uname, {}).get('telegram_id')
            if tid:
                bot.send_message(tid,
                    f"⚠️ تم خصم `{pts}` نقطة من حسابك.\n💰 رصيدك: *{new_pts}* نقطة",
                    parse_mode="Markdown")
        except Exception:
            pass
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

def admin_add_points_user_step(message):
    query = message.text.strip()
    uname, data = find_user_by_query(query)
    if not uname:
        bot.send_message(message.chat.id, "❌ المستخدم غير موجود.\n💡 أرسل اسم المستخدم أو Telegram ID.")
        return
    msg = bot.send_message(message.chat.id, f"💰 كم نقطة تريد إضافتها لـ `{uname}`؟", parse_mode="Markdown")
    bot.register_next_step_handler(msg, lambda m: admin_add_points_amount_step(m, uname))

def admin_add_points_amount_step(message, uname):
    try:
        pts = int(message.text.strip())
        if pts <= 0:
            bot.send_message(message.chat.id, "❌ أرسل رقماً أكبر من صفر.")
            return
        new_pts = add_points(uname, pts, f"إضافة من الأدمن")
        if new_pts is None:
            bot.send_message(message.chat.id, "❌ المستخدم غير موجود.")
            return
        _log_action("إضافة نقاط", admin_id=message.from_user.id,
                    details=f"إضافة {pts} نقطة لـ {uname}")
        bot.send_message(message.chat.id, f"✅ تم إضافة `{pts}` نقطة لـ `{uname}`.\n💰 رصيده: `{new_pts}` نقطة.", parse_mode="Markdown")
        try:
            users = load_users()
            tid = users.get(uname, {}).get('telegram_id')
            if tid:
                bot.send_message(tid, f"🎉 تم إضافة `{pts}` نقطة لحسابك!\n💰 رصيدك: `{new_pts}` نقطة.", parse_mode="Markdown")
        except Exception:
            pass
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

def admin_check_user_step(message):
    query = message.text.strip()
    users = load_users()
    uname = None
    data = None

    if query.isdigit():
        tid = int(query)
        for u, d in users.items():
            if d.get('telegram_id') == tid:
                uname = u
                data = d
                break
    else:
        uname = query
        data = users.get(uname)

    if not data:
        bot.send_message(message.chat.id, "❌ المستخدم غير موجود.")
        return

    status = "🔴 محظور" if data.get('banned') else "🟢 نشط"
    password = data.get('password_plain', '🔒 مشفرة')
    plans = load_subscription_plans()
    plan_key = data.get('plan', 'free_trial')
    plan_info = plans.get(plan_key, {})
    expiry = data.get('expiry')
    expiry_txt = "-"
    if expiry:
        try:
            remaining = (datetime.fromisoformat(expiry) - datetime.now()).days
            expiry_txt = f"{max(0, remaining)} يوم متبقي" if remaining >= 0 else "منتهية ⚠️"
        except Exception:
            pass
    invited = get_invited_count(data.get('telegram_id', 0))

    msg = (
        f"🔍 **معلومات المستخدم:**\n\n"
        f"👤 الاسم: `{uname}`\n"
        f"🔑 كلمة المرور: `{password}`\n"
        f"📊 الحالة: {status}\n"
        f"💰 النقاط: `{data.get('points', 0)}`\n"
        f"🖥️ السيرفرات المسموحة: `{data.get('max_servers', 2)}`\n"
        f"📦 الباقة: {plan_info.get('label', plan_key)}\n"
        f"⏳ الانتهاء: {expiry_txt}\n"
        f"🔗 عدد الدعوات: `{invited}`\n"
        f"📅 تاريخ الإنشاء: `{str(data.get('created', '-'))[:10]}`\n"
        f"📱 Telegram ID: `{data.get('telegram_id', '-')}`"
    )
    bot.send_message(message.chat.id, msg, parse_mode="Markdown")

def admin_set_server_cost_step(message):
    try:
        cost = int(message.text.strip())
        if cost < 0:
            bot.send_message(message.chat.id, "❌ يجب أن يكون الرقم أكبر من أو يساوي صفر.")
            return
        settings = load_bot_settings()
        old = settings.get('points_per_server', 10)
        settings['points_per_server'] = cost
        save_bot_settings(settings)
        _log_action("تعديل تكلفة السيرفر", admin_id=message.from_user.id,
                    details=f"من {old} إلى {cost}")
        bot.send_message(message.chat.id, f"✅ تم تحديث تكلفة السيرفر إلى `{cost}` نقطة.", parse_mode="Markdown")
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

def admin_set_panel_url_step(message):
    url = message.text.strip()
    if not url.startswith('http'):
        bot.send_message(message.chat.id, "❌ اللينك يجب أن يبدأ بـ http أو https.")
        return
    settings = load_bot_settings()
    settings['panel_url'] = url
    save_bot_settings(settings)
    _log_action("تعديل لينك اللوحة", admin_id=message.from_user.id, details=url)
    bot.send_message(message.chat.id,
        f"✅ تم تعيين لينك اللوحة:\n🔗 `{url}`",
        parse_mode="Markdown")

def admin_set_invite_points_step(message):
    try:
        pts = int(message.text.strip())
        if pts < 0:
            bot.send_message(message.chat.id, "❌ يجب أن يكون الرقم أكبر من أو يساوي صفر.")
            return
        settings = load_bot_settings()
        old = settings.get('points_per_invite', 1)
        settings['points_per_invite'] = pts
        save_bot_settings(settings)
        _log_action("تعديل نقاط الإحالة", admin_id=message.from_user.id,
                    details=f"من {old} إلى {pts}")
        bot.send_message(message.chat.id, f"✅ تم تحديث نقاط الإحالة إلى `{pts}`.", parse_mode="Markdown")
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

def admin_sub_edit_contact_step(message):
    contact = message.text.strip()
    if not contact.startswith('@'):
        contact = '@' + contact
    plans = load_subscription_plans()
    old = plans.get('payment_contact', '')
    plans['payment_contact'] = contact
    save_subscription_plans(plans)
    _log_action("تعديل حساب الدفع", admin_id=message.from_user.id,
                details=f"من {old} إلى {contact}")
    bot.send_message(message.chat.id, f"✅ تم تحديث حساب الدفع إلى: `{contact}`", parse_mode="Markdown")

def admin_sub_edit_value_step(message, plan_key, field, label):
    try:
        value = int(message.text.strip())
        if value < 0:
            bot.send_message(message.chat.id, "❌ يجب أن يكون الرقم أكبر من أو يساوي صفر.")
            return
        plans = load_subscription_plans()
        old = plans.get(plan_key, {}).get(field, 0)
        plans.setdefault(plan_key, {})[field] = value
        save_subscription_plans(plans)
        _log_action(f"تعديل {label}", admin_id=message.from_user.id,
                    details=f"من {old} إلى {value}")
        bot.send_message(message.chat.id, f"✅ تم تحديث {label} إلى `{value}`.", parse_mode="Markdown")
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

# ─── تعديل عدد سيرفرات مستخدم ───

def admin_edit_max_servers_step(message):
    query = message.text.strip()
    uname, data = find_user_by_query(query)
    if not uname:
        bot.send_message(message.chat.id, "❌ المستخدم غير موجود.\n💡 أرسل اسم المستخدم أو Telegram ID.")
        return
    users = load_users()
    current = users[uname].get('max_servers', 2)
    msg = bot.send_message(message.chat.id,
        f"✏️ المستخدم: `{uname}`\nعدد السيرفرات الحالي: `{current}`\n\nأرسل العدد الجديد:",
        parse_mode="Markdown")
    bot.register_next_step_handler(msg, lambda m: admin_edit_max_servers_amount(m, uname))

def admin_edit_max_servers_amount(message, uname):
    try:
        count = int(message.text.strip())
        if count < 0:
            bot.send_message(message.chat.id, "❌ أرسل رقماً أكبر من أو يساوي صفر.")
            return
        users = load_users()
        if uname not in users:
            bot.send_message(message.chat.id, "❌ المستخدم غير موجود.")
            return
        old = users[uname].get('max_servers', 2)
        users[uname]['max_servers'] = count
        save_users(users)
        _log_action("تعديل سيرفرات مستخدم", admin_id=message.from_user.id,
                    details=f"{uname}: من {old} إلى {count}")
        bot.send_message(message.chat.id,
            f"✅ تم تعديل عدد سيرفرات `{uname}` من `{old}` إلى `{count}`.",
            parse_mode="Markdown")
        try:
            tid = users[uname].get('telegram_id')
            if tid:
                bot.send_message(tid, f"✏️ تم تعديل عدد سيرفراتك إلى `{count}`.", parse_mode="Markdown")
        except Exception:
            pass
    except ValueError:
        bot.send_message(message.chat.id, "❌ أرسل رقماً صحيحاً.")

# ─── حذف مستخدم نهائياً ───

def admin_delete_user_step(message):
    query = message.text.strip()
    uname, data = find_user_by_query(query)
    if not uname:
        bot.send_message(message.chat.id, "❌ المستخدم غير موجود.\n💡 أرسل اسم المستخدم أو Telegram ID.")
        return
    mk = types.InlineKeyboardMarkup(row_width=2)
    mk.add(
        ikb_button(f"🗑️ نعم، احذف {uname}", callback_data=f"admin_confirm_del_user_{uname}", style="danger"),
        ikb_button("❌ إلغاء", callback_data="admin_cancel_del_user", style="primary")
    )
    bot.send_message(message.chat.id,
        f"⚠️ **تأكيد الحذف**\n\n"
        f"هل تريد حذف المستخدم `{uname}` نهائياً?\n"
        f"📱 Telegram ID: `{data.get('telegram_id', '-')}`\n"
        f"💰 النقاط: `{data.get('points', 0)}`\n\n"
        f"⚠️ هذا الإجراء لا يمكن التراجع عنه!",
        parse_mode="Markdown", reply_markup=mk)

@bot.callback_query_handler(func=lambda call: call.data.startswith("admin_confirm_del_user_"))
def admin_confirm_delete_user(call):
    if not is_admin(call.from_user.id):
        bot.answer_callback_query(call.id, "⛔ ليس لديك صلاحية!")
        return
    uname = call.data.replace("admin_confirm_del_user_", "", 1)
    users = load_users()
    if uname not in users:
        bot.answer_callback_query(call.id, "❌ المستخدم غير موجود.")
        return
    data = users.pop(uname)
    save_users(users)
    user_folder = os.path.join(USERS_FOLDER, uname)
    if os.path.exists(user_folder):
        try:
            import shutil
            shutil.rmtree(user_folder)
        except Exception:
            pass
    ips = load_ips()
    assigned = ips.get('assigned', {})
    assigned.pop(uname, None)
    save_ips(ips)
    _log_action("حذف مستخدم", admin_id=call.from_user.id,
                details=f"حذف {uname} (TG: {data.get('telegram_id', '-')})")
    try:
        bot.edit_message_text(f"✅ تم حذف المستخدم `{uname}` نهائياً.",
            call.message.chat.id, call.message.message_id, parse_mode="Markdown")
    except Exception:
        bot.send_message(call.message.chat.id, f"✅ تم حذف المستخدم `{uname}` نهائياً.", parse_mode="Markdown")
    try:
        tid = data.get('telegram_id')
        if tid:
            bot.send_message(tid, "🗑️ تم حذف حسابك من البوت نهائياً.")
    except Exception:
        pass

@bot.callback_query_handler(func=lambda call: call.data == "admin_cancel_del_user")
def admin_cancel_delete_user(call):
    if not is_admin(call.from_user.id):
        return
    try:
        bot.edit_message_text("🚫 تم إلغاء الحذف.", call.message.chat.id, call.message.message_id)
    except Exception:
        bot.send_message(call.message.chat.id, "🚫 تم إلغاء الحذف.")

# ─── بث رسالة لجميع المستخدمين ───

def admin_broadcast_step(message):
    if message.text and message.text.strip() == '/cancel':
        bot.send_message(message.chat.id, "🚫 تم إلغاء البث.")
        return
    users = load_users()
    if not users:
        bot.send_message(message.chat.id, "❌ لا يوجد مستخدمون.")
        return

    tg_ids = set()
    for u, data in users.items():
        tid = data.get('telegram_id')
        if tid:
            tg_ids.add(tid)

    sent = 0
    failed = 0
    bot.send_message(message.chat.id, f"📢 جاري إرسال الرسالة لـ `{len(tg_ids)}` مستخدم...", parse_mode="Markdown")

    for tid in tg_ids:
        try:
            bot.send_message(tid, message.text, parse_mode="Markdown")
            sent += 1
        except Exception:
            failed += 1
        _time.sleep(0.05)

    _log_action("بث رسالة", admin_id=message.from_user.id,
                details=f"إرسال لـ {sent} مستخدم, فشل: {failed}")
    bot.send_message(message.chat.id,
        f"✅ **تم البث بنجاح!**\n\n"
        f"📤 نجح: `{sent}`\n"
        f"❌ فشل: `{failed}`\n"
        f"📊 الإجمالي: `{len(tg_ids)}`",
        parse_mode="Markdown")

# ──────────────────────────────────────────────
#  فحص انتهاء الباقات
# ──────────────────────────────────────────────

def _check_expired_subscriptions():
    while True:
        try:
            users = load_users()
            plans = load_subscription_plans()
            changed = False
            for uname, data in users.items():
                expiry = data.get('expiry')
                if not expiry or data.get('expiry_notified'):
                    continue
                try:
                    expiry_dt = datetime.fromisoformat(expiry)
                except Exception:
                    continue
                if datetime.now() < expiry_dt:
                    continue
                tid = data.get('telegram_id')
                plan_key = data.get('plan', 'free_trial')
                plan_info = plans.get(plan_key, {})
                if tid:
                    try:
                        bot.send_message(tid,
                            f"⚠️ **انتهت صلاحية باقتك!**\n\n"
                            f"📦 الباقة: {plan_info.get('label', plan_key)}\n"
                            f"👤 الحساب: `{uname}`\n\n"
                            f"للتجديد اضغط على زر 📦 الباقات.",
                            parse_mode="Markdown")
                    except Exception:
                        pass
                data['expiry_notified'] = True
                changed = True
            if changed:
                save_users(users)
        except Exception as e:
            print(f" * [subscription-checker] error: {e}")
        _time.sleep(1800)

_expiry_thread = threading.Thread(target=_check_expired_subscriptions, daemon=True)
_expiry_thread.start()

# ──────────────────────────────────────────────
#  تشغيل البوت
# ──────────────────────────────────────────────

print(" * Starting Advanced Telegram Bot...")
try:
    import importlib.metadata as _ilm
    _v = _ilm.version('pyTelegramBotAPI')
    print(f" * pyTelegramBotAPI version: {_v}")
except Exception:
    pass

bot.remove_webhook()
bot.infinity_polling(timeout=30, long_polling_timeout=30)
