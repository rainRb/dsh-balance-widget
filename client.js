window.__ModuleLoader__.load({
  id: '@local/dsh-balance-widget',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;

    // Client identity carried by account Remote calls, matching the account
    // settings client so Platform request headers stay consistent.
    const VERSION = '0.2.1-rc.2';
    const REFRESH_MS = 30000;
    const PANEL_GAP = 8;
    const PANEL_MARGIN = 12;
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

    function formatAmount(raw) {
      const value = Number(raw);
      if (!Number.isFinite(value)) return String(raw ?? '--');
      const sign = value < 0 ? '-' : '';
      const abs = Math.abs(value);
      if (abs > 0 && abs < 0.01) return sign + '<0.01';
      const [whole, fraction] = abs.toFixed(2).split('.');
      return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction;
    }

    function currencySymbol(currency) {
      if (currency === 'CNY') return '¥';
      if (currency === 'USD') return '$';
      return currency ? currency + ' ' : '';
    }

    function walletText(wallet) {
      return currencySymbol(wallet.currency) + formatAmount(wallet.balance);
    }

    function totalsByCurrency(wallets) {
      const totals = new Map();
      for (const wallet of wallets) {
        const value = Number(wallet.balance);
        if (!Number.isFinite(value)) continue;
        totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + value);
      }
      return [...totals].map(([currency, amount]) => ({ currency, balance: amount }));
    }

    function WalletIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 14,
          height: 14,
          'aria-hidden': true,
          style: { display: 'block', flex: 'none' },
        },
        h('rect', {
          x: 2.5,
          y: 6,
          width: 19,
          height: 13,
          rx: 3,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
        }),
        h('path', { d: 'M2.5 10h19', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }),
        h('circle', { cx: 17, cy: 14.8, r: 1.4, fill: 'currentColor' }),
      );
    }

    // Surface, typography and grid mirror ui-chat's stat-dialog.module.css so the
    // hover card matches the composer's neighbouring usage dialogs.
    const PANEL_STYLE = {
      zIndex: 1100,
      boxSizing: 'border-box',
      borderRadius: 'var(--dsw-radius-lg)',
      background: 'var(--dsw-specific-menu)',
      width: 'max-content',
      minWidth: 'min(300px, 100vw - 24px)',
      maxWidth: 'min(440px, 100vw - 24px)',
      backdropFilter: 'var(--dsw-menu-backdrop-filter)',
      WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter)',
      '--dsw-elevation-stroke-color': 'var(--dsw-alias-border-l1)',
      boxShadow: 'var(--dsw-elevation-prominent)',
      color: 'var(--dsw-alias-label-secondary)',
      cursor: 'default',
      border: 0,
      padding: 16,
      fontSize: 12,
      lineHeight: '18px',
      position: 'fixed',
    };
    const TITLE_STYLE = {
      color: 'var(--dsw-alias-label-primary)',
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 8,
      fontWeight: 500,
    };
    const TITLE_LABEL_STYLE = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
    };
    const TITLE_VALUE_STYLE = { fontVariantNumeric: 'tabular-nums' };
    const RULE_STYLE = {
      borderTop: '0.5px solid var(--dsw-alias-border-l2)',
      marginBottom: 10,
    };
    const DETAILS_STYLE = {
      color: 'var(--dsw-alias-label-tertiary)',
      display: 'grid',
      gridTemplateColumns: 'minmax(76px,auto) minmax(0,1fr)',
      gap: '6px 16px',
      margin: 0,
    };
    const DT_STYLE = { minWidth: 0, margin: 0 };
    const DD_STYLE = {
      minWidth: 0,
      margin: 0,
      color: 'var(--dsw-alias-label-secondary)',
      fontVariantNumeric: 'tabular-nums',
      textAlign: 'right',
      overflowWrap: 'anywhere',
    };
    const FOOTER_STYLE = {
      marginTop: 12,
      paddingTop: 10,
      borderTop: '0.5px solid var(--dsw-alias-border-l2)',
    };
    const LINK_STYLE = {
      color: 'var(--dsw-alias-label-secondary)',
      textDecoration: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    };

    // The shell ships useAnchoredPosition; keep a small local fallback so an
    // older primitive build still places the card above the trigger.
    function useFallbackAnchoredPosition({ open, anchorRef, panelRef, side, gap, margin }) {
      const [pos, setPos] = React.useState(undefined);
      React.useLayoutEffect(() => {
        if (!open || !anchorRef.current || !panelRef.current) {
          setPos(undefined);
          return;
        }
        const anchor = anchorRef.current.getBoundingClientRect();
        const panel = panelRef.current.getBoundingClientRect();
        const left = Math.min(
          Math.max(margin, anchor.left + anchor.width / 2 - panel.width / 2),
          window.innerWidth - panel.width - margin,
        );
        const top =
          side === 'top'
            ? Math.max(margin, anchor.top - panel.height - gap)
            : Math.min(window.innerHeight - panel.height - margin, anchor.bottom + gap);
        setPos({ left, top });
      }, [open, anchorRef, panelRef, side, gap, margin]);
      return pos;
    }

    const useAnchoredPosition = primitives.useAnchoredPosition ?? useFallbackAnchoredPosition;

    function BalanceWidget(props) {
      const { getBalance, getState, isChinese } = props;
      const [state, setState] = React.useState({ phase: 'loading' });
      const [links, setLinks] = React.useState(undefined);
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const hideTimer = React.useRef(undefined);

      const pos = useAnchoredPosition({
        open,
        anchorRef: rootRef,
        panelRef,
        side: 'top',
        gap: PANEL_GAP,
        margin: PANEL_MARGIN,
      });

      const show = React.useCallback(() => {
        if (hideTimer.current !== undefined) {
          clearTimeout(hideTimer.current);
          hideTimer.current = undefined;
        }
        setOpen(true);
      }, []);

      const hide = React.useCallback(() => {
        if (hideTimer.current !== undefined) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          hideTimer.current = undefined;
          setOpen(false);
        }, 120);
      }, []);

      React.useEffect(() => {
        let disposed = false;
        let timer;

        const load = async () => {
          const [balanceResult, accountResult] = await Promise.allSettled([
            (async () => getBalance())(),
            (async () => getState())(),
          ]);
          if (disposed) return;

          if (accountResult.status === 'fulfilled' && accountResult.value?.ok) {
            const nextLinks = accountResult.value.value?.links;
            if (nextLinks?.usageUrl) setLinks(nextLinks);
          }

          const result = balanceResult.status === 'fulfilled' ? balanceResult.value : undefined;
          if (!result || result.ok !== true) {
            setState({ phase: 'error' });
            return;
          }
          const value = result.value;
          if (value && value.status === 'ready') {
            setState({
              phase: 'ready',
              wallets: Array.isArray(value.value) ? value.value : [],
              bonuses: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
            });
          } else if (value && value.status === 'failed') {
            setState({ phase: 'error' });
          } else {
            setState({ phase: 'signed-out' });
          }
        };

        const schedule = () => {
          timer = setTimeout(() => {
            load().finally(() => {
              if (!disposed) schedule();
            });
          }, REFRESH_MS);
        };

        load().finally(() => {
          if (!disposed) schedule();
        });

        const onVisibility = () => {
          if (document.visibilityState === 'visible') load();
        };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
          disposed = true;
          if (timer !== undefined) clearTimeout(timer);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [getBalance, getState]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [open]);

      React.useEffect(
        () => () => {
          if (hideTimer.current !== undefined) clearTimeout(hideTimer.current);
        },
        [],
      );

      const labels = isChinese
        ? {
            title: '账户余额',
            recharge: '充值余额',
            bonus: '赠金',
            total: '合计',
            view: '查看余额明细',
            loading: '正在读取账户余额',
            unavailable: '暂时无法读取余额，稍后自动重试',
            signedOut: '登录 DeepSeek 账号后显示余额',
            unknown: '余额',
            dash: '--',
          }
        : {
            title: 'Account balance',
            recharge: 'Balance',
            bonus: 'Bonus',
            total: 'Total',
            view: 'View balance details',
            loading: 'Loading account balance',
            unavailable: 'Balance unavailable; retrying automatically',
            signedOut: 'Sign in to a DeepSeek account to see the balance',
            unknown: 'Balance',
            dash: '--',
          };

      const wallets = state.phase === 'ready' ? state.wallets : [];
      const bonuses =
        state.phase === 'ready'
          ? state.bonuses.filter((wallet) => Number(wallet.balance) > 0)
          : [];
      const totals = totalsByCurrency([...wallets, ...bonuses]);
      const totalText = totals.length > 0 ? totals.map(walletText).join(' · ') : labels.dash;
      const rechargeText = wallets.length > 0 ? wallets.map(walletText).join(' · ') : labels.dash;
      const bonusText = bonuses.length > 0 ? bonuses.map(walletText).join(' · ') : labels.dash;

      let text;
      let detail;
      if (state.phase === 'ready') {
        text = totalText;
        detail = labels.title + ' ' + totalText;
      } else if (state.phase === 'loading') {
        text = isChinese ? '余额 …' : 'Balance …';
        detail = labels.loading;
      } else if (state.phase === 'signed-out') {
        text = isChinese ? '未登录' : 'Signed out';
        detail = labels.signedOut;
      } else {
        text = isChinese ? '余额 --' : 'Balance --';
        detail = labels.unavailable;
      }

      const usageUrl = links?.usageUrl;
      const triggerStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 8px 1px 6px',
        borderRadius: 999,
        fontSize: 11,
        lineHeight: '16px',
        fontWeight: 400,
        fontFamily: 'inherit',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        color: 'inherit',
        opacity: open ? 0.95 : 0.8,
        background: 'color-mix(in srgb, currentColor 8%, transparent)',
        border: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
        textDecoration: 'none',
        cursor: usageUrl ? 'pointer' : 'default',
      };

      return h(
        'span',
        {
          ref: rootRef,
          style: { display: 'inline-flex' },
          onMouseEnter: show,
          onMouseLeave: hide,
          onFocus: show,
          onBlur: hide,
        },
        h(
          'a',
          {
            href: usageUrl,
            target: usageUrl ? '_blank' : undefined,
            rel: usageUrl ? 'noreferrer' : undefined,
            role: usageUrl ? undefined : 'status',
            'aria-label': detail,
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            onClick: (event) => {
              if (!usageUrl) event.preventDefault();
              setOpen(false);
            },
            style: triggerStyle,
          },
          h(WalletIcon),
          h('span', null, text),
        ),
        open &&
          ReactDOM.createPortal(
            h(
              'div',
              {
                ref: panelRef,
                role: 'dialog',
                'aria-label': labels.title,
                style: { ...PANEL_STYLE, ...(pos ?? MEASURE_STYLE) },
                onMouseEnter: show,
                onMouseLeave: hide,
                onFocus: show,
                onBlur: hide,
              },
              h(
                'div',
                { style: TITLE_STYLE },
                h('span', { style: TITLE_LABEL_STYLE }, h(WalletIcon), labels.title),
                h('span', { style: TITLE_VALUE_STYLE }, totalText),
              ),
              h('div', { style: RULE_STYLE, 'aria-hidden': true }),
              h(
                'dl',
                { style: DETAILS_STYLE },
                h('dt', { style: DT_STYLE }, labels.recharge),
                h('dd', { style: DD_STYLE }, rechargeText),
                h('dt', { style: DT_STYLE }, labels.bonus),
                h('dd', { style: DD_STYLE }, bonusText),
                h('dt', { style: DT_STYLE }, labels.total),
                h('dd', { style: DD_STYLE }, totalText),
              ),
              usageUrl &&
                h(
                  'div',
                  { style: FOOTER_STYLE },
                  h(
                    'a',
                    {
                      href: usageUrl,
                      target: '_blank',
                      rel: 'noreferrer',
                      style: LINK_STYLE,
                    },
                    labels.view,
                    ' ↗',
                  ),
                ),
            ),
            document.body,
          ),
      );
    }

    const inject = ['slots', 'locale', 'remote', 'remote.account'];

    function apply(ctx) {
      const isChinese = () => {
        try {
          return String(ctx.locale.getSnapshot().active).toLowerCase().startsWith('zh');
        } catch {
          return true;
        }
      };

      const clientMetadata = () => ({
        version: VERSION,
        locale: ctx.locale.getSnapshot().active,
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      });

      const getBalance = () => ctx.remote.account.getBalance(clientMetadata());
      const getState = () => ctx.remote.account.getState();

      ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.composer.dock',
            id: 'balance-widget',
            order: 5,
          },
          () =>
            h(BalanceWidget, {
              getBalance,
              getState,
              isChinese: isChinese(),
            }),
        ),
      );
    }

    return { inject, apply };
  },
});
