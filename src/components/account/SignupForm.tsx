"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { EMPTY_SIGNUP, PASSWORD_RULES, formatCep, formatDocument, formatPhone, signupErrors, type SignupErrors, type SignupInput } from "@/lib/api/validation";
import { setCustomer } from "@/lib/customer";
import { PERFIL_LABEL, PESSOA_LABEL, QUESTIONARIO_REVENDA, isPerfil, isPessoa, questionarioErros, type Perfil, type Pessoa, type Respostas, type SituacaoRevenda } from "@/lib/revenda";
import { lookupCep, postJson } from "./client-api";
import { FormAlert, FormSection, PasswordField, SelectField, UfSelect } from "./FormBits";

/** Revendedor: aprovado na hora (CNPJ com atividade gráfica) ou em avaliação, com o texto para o cliente. */
export type RevendaCriada = { situacao: SituacaoRevenda; texto: string };

type Props = {
  /** Conta criada. `loggedIn` = já entrou (login automático deu certo). */
  onSuccess: (result: { loggedIn: boolean; message?: string; revenda?: RevendaCriada }) => void;
  /** O onSuccess navega quando já entrou: o botão segue carregando até a página trocar. */
  navigatesOnLogin?: boolean;
};

const PERFIS: { perfil: Perfil; texto: string }[] = [
  { perfil: "cliente", texto: "Para comprar para você ou para a sua empresa." },
  { perfil: "revendedor", texto: "Para gráficas e revendas. O preço de revenda vale depois da aprovação." },
];

/** "Como você se identifica?": cliente ou revendedor gráfico, cada um com CPF ou CNPJ (modelo de cadastro da Padrão). */
function Identificacao({ onPick }: { onPick: (perfil: Perfil, pessoa: Pessoa) => void }) {
  return (
    <section aria-labelledby="como-se-identifica" className="space-y-6">
      <h2 id="como-se-identifica" className="text-center text-lg font-bold">
        Como você se identifica?
      </h2>
      <div className="grid gap-4 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
        {PERFIS.map(({ perfil, texto }) => (
          <div key={perfil} className="rounded-thumb border border-line p-5 text-center md:rounded-none md:border-0 md:px-8 md:py-2">
            <h3 className="text-[17px] font-bold">{PERFIL_LABEL[perfil]}</h3>
            <p className="mt-1 text-caption text-muted">{texto}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["pf", "pj"] as const).map((pessoa) => (
                <Button key={pessoa} type="button" variant="outline" size="sm" onClick={() => onPick(perfil, pessoa)} aria-label={`${PERFIL_LABEL[perfil]} com ${pessoa === "pf" ? "CPF" : "CNPJ"}`}>
                  {pessoa === "pf" ? "CPF" : "CNPJ"}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Cadastro → POST /api/conta/cadastro (POST /cadastrarcliente + login automático). */
export function SignupForm({ onSuccess, navigatesOnLogin = false }: Props) {
  const [form, setForm] = useState<SignupInput>(EMPTY_SIGNUP);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [errors, setErrors] = useState<SignupErrors>({});
  const [erroResposta, setErroResposta] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  // CEP da última busca: resposta atrasada de um CEP anterior é descartada.
  const cepAsked = useRef("");

  const set = (field: keyof SignupInput) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const responder = (id: string) => (value: string) => {
    setRespostas((current) => ({ ...current, [id]: value }));
    if (erroResposta[id]) setErroResposta((current) => ({ ...current, [id]: "" }));
  };

  if (!isPerfil(form.perfil) || !isPessoa(form.pessoa)) {
    return <Identificacao onPick={(perfil, pessoa) => setForm((current) => ({ ...current, perfil, pessoa }))} />;
  }
  const perfil = form.perfil;
  const pj = form.pessoa === "pj";
  const revendedor = perfil === "revendedor";

  const trocarPessoa = (pessoa: Pessoa) => {
    if (pessoa === form.pessoa) return;
    // CPF e CNPJ não se aproveitam: o documento recomeça.
    setForm((current) => ({ ...current, pessoa, documento: "" }));
    setErrors({});
  };

  const onCep = async (value: string) => {
    const cep = formatCep(value);
    set("cep")(cep);
    const digits = cep.replace(/\D/g, "");
    cepAsked.current = digits;
    if (digits.length !== 8) {
      setCepStatus(null);
      return;
    }
    setCepStatus("Buscando o endereço…");
    const found = await lookupCep(cep);
    if (cepAsked.current !== digits) return;
    if (!found) {
      setCepStatus("CEP não encontrado. Preencha o endereço.");
      return;
    }
    setForm((current) => ({ ...current, logradouro: found.logradouro || current.logradouro, bairro: found.bairro || current.bairro, cidade: found.cidade || current.cidade, estado: found.estado || current.estado }));
    setErrors((current) => ({
      ...current,
      logradouro: found.logradouro ? undefined : current.logradouro,
      bairro: found.bairro ? undefined : current.bairro,
      cidade: found.cidade ? undefined : current.cidade,
      estado: found.estado ? undefined : current.estado,
    }));
    setCepStatus("Endereço encontrado. Confira e informe o número.");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = signupErrors(form);
    const pendentes = revendedor ? questionarioErros(respostas) : {};
    setErrors(found);
    setErroResposta(pendentes);
    if (Object.keys(found).length || Object.keys(pendentes).length) {
      setError("Confira os campos destacados.");
      return;
    }
    setBusy(true);
    setError(null);
    const reply = await postJson<{ loggedIn: boolean; customer?: unknown; message?: string; revenda?: RevendaCriada }>("/api/conta/cadastro", {
      ...form,
      ...(revendedor ? { questionario: respostas } : {}),
      site: honeypot,
    });
    if (!reply.ok) {
      setBusy(false);
      const { fields, questionario } = reply.data;
      if (fields && typeof fields === "object") setErrors(fields as SignupErrors);
      if (questionario && typeof questionario === "object") setErroResposta(questionario as Record<string, string>);
      setError(reply.error);
      return;
    }
    if (reply.data.loggedIn) setCustomer(reply.data.customer);
    if (!(reply.data.loggedIn && navigatesOnLogin && !reply.data.revenda)) setBusy(false);
    onSuccess({ loggedIn: reply.data.loggedIn, message: reply.data.message, revenda: reply.data.revenda });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-thumb bg-mist px-4 py-3">
        <p className="text-sm">
          Cadastro de <strong>{revendedor ? "revendedor gráfico" : "cliente"}</strong>
        </p>
        <Button type="button" variant="link" size="sm" onClick={() => setForm((current) => ({ ...current, perfil: "" }))}>
          Trocar
        </Button>
      </div>

      <FormSection title="Dados de cadastro">
        <div role="radiogroup" aria-label="Tipo de cadastro" className="flex flex-wrap gap-x-6 gap-y-2 md:col-span-2">
          {(["pf", "pj"] as const).map((pessoa) => (
            <label key={pessoa} className="flex cursor-pointer items-center gap-2 text-[15px] font-semibold">
              <input type="radio" name="pessoa" checked={form.pessoa === pessoa} onChange={() => trocarPessoa(pessoa)} className="size-4 accent-ink" />
              {PESSOA_LABEL[pessoa]}
            </label>
          ))}
        </div>
        {pj ? (
          <>
            <TextField label="Razão social" value={form.nome} onChange={set("nome")} error={errors.nome} autoComplete="organization" required />
            <TextField label="Nome fantasia" value={form.apelido} onChange={set("apelido")} error={errors.apelido} autoComplete="off" required />
            <TextField label="CNPJ" value={form.documento} onChange={(value) => set("documento")(formatDocument(value))} error={errors.documento} autoComplete="off" required />
            <TextField label="Inscrição estadual (opcional)" value={form.inscricaoEstadual} onChange={set("inscricaoEstadual")} autoComplete="off" />
            <TextField label="Inscrição municipal (opcional)" value={form.inscricaoMunicipal} onChange={set("inscricaoMunicipal")} autoComplete="off" />
            <TextField label="Ramo de atividade (opcional)" value={form.ramo} onChange={set("ramo")} autoComplete="off" />
            <TextField label="Nome do responsável (opcional)" value={form.responsavel} onChange={set("responsavel")} autoComplete="name" className="md:col-span-2" />
            <TextField label="CPF do responsável" value={form.cpfResponsavel} onChange={(value) => set("cpfResponsavel")(formatDocument(value).slice(0, 14))} error={errors.cpfResponsavel} inputMode="numeric" autoComplete="off" required />
            <TextField label="Data de nascimento do responsável" type="date" value={form.nascimento} onChange={set("nascimento")} error={errors.nascimento} autoComplete="off" required />
          </>
        ) : (
          <>
            <TextField label="Nome completo" value={form.nome} onChange={set("nome")} error={errors.nome} autoComplete="name" required />
            <TextField label="Nome de exibição" value={form.apelido} onChange={set("apelido")} error={errors.apelido} hint="Como você quer ser chamado" autoComplete="nickname" required />
            <TextField label="CPF" value={form.documento} onChange={(value) => set("documento")(formatDocument(value).slice(0, 14))} error={errors.documento} inputMode="numeric" autoComplete="off" required />
            <TextField label="Data de nascimento" type="date" value={form.nascimento} onChange={set("nascimento")} error={errors.nascimento} autoComplete="bday" required />
          </>
        )}
      </FormSection>

      <FormSection title="Endereço" description="Usamos para a nota fiscal e como endereço de entrega padrão.">
        <TextField
          label="CEP"
          value={form.cep}
          onChange={onCep}
          error={errors.cep}
          hint={cepStatus ?? undefined}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          required
        />
        <TextField label="Endereço" value={form.logradouro} onChange={set("logradouro")} error={errors.logradouro} autoComplete="address-line1" required />
        <TextField label="Número" value={form.numero} onChange={set("numero")} error={errors.numero} autoComplete="off" required />
        <TextField label="Complemento (opcional)" value={form.complemento} onChange={set("complemento")} autoComplete="address-line2" />
        <TextField label="Bairro" value={form.bairro} onChange={set("bairro")} error={errors.bairro} autoComplete="address-level3" required />
        <TextField label="Cidade" value={form.cidade} onChange={set("cidade")} error={errors.cidade} autoComplete="address-level2" required />
        <UfSelect label="Estado" value={form.estado} onChange={set("estado")} error={errors.estado} />
        <TextField label="Referência (opcional)" value={form.referencia} onChange={set("referencia")} hint="Um ponto conhecido perto do endereço" autoComplete="off" />
      </FormSection>

      <FormSection title="Contato">
        <TextField label="Telefone 1" type="tel" value={form.telefone} onChange={(value) => set("telefone")(formatPhone(value))} error={errors.telefone} autoComplete="tel" inputMode="tel" placeholder="(21) 90000-0000" required />
        <TextField label="Telefone 2 (opcional)" type="tel" value={form.telefone2} onChange={(value) => set("telefone2")(formatPhone(value))} error={errors.telefone2} autoComplete="off" inputMode="tel" />
        <TextField label="E-mail principal" type="email" value={form.email} onChange={set("email")} error={errors.email} autoComplete="email" inputMode="email" required />
        <TextField label="E-mail secundário (opcional)" type="email" value={form.emailSecundario} onChange={set("emailSecundario")} error={errors.emailSecundario} autoComplete="off" inputMode="email" />
      </FormSection>

      {revendedor && (
        <FormSection
          title="Sobre a sua revenda"
          description={
            pj
              ? "Com uma atividade gráfica no CNPJ (CNAE), o cadastro de revendedor é aprovado na hora. Sem ela, passa pela avaliação da Padrão Color."
              : "O cadastro de revendedor com CPF passa pela avaliação da Padrão Color. Enquanto isso, você compra com o preço de cliente."
          }
        >
          {QUESTIONARIO_REVENDA.map((pergunta) =>
            pergunta.tipo === "opcao" ? (
              <SelectField
                key={pergunta.id}
                label={pergunta.obrigatoria ? pergunta.texto : `${pergunta.texto} (opcional)`}
                value={respostas[pergunta.id] ?? ""}
                onChange={responder(pergunta.id)}
                options={pergunta.opcoes}
                placeholder="Selecione"
                error={erroResposta[pergunta.id] || null}
                className="md:col-span-2"
              />
            ) : (
              <TextField
                key={pergunta.id}
                label={pergunta.obrigatoria ? pergunta.texto : `${pergunta.texto} (opcional)`}
                value={respostas[pergunta.id] ?? ""}
                onChange={responder(pergunta.id)}
                placeholder={pergunta.exemplo}
                error={erroResposta[pergunta.id] || null}
                maxLength={300}
                autoComplete="off"
                className="md:col-span-2"
              />
            ),
          )}
        </FormSection>
      )}

      <FormSection title="Acesso" description={`Senha com ${PASSWORD_RULES.min} a ${PASSWORD_RULES.max} caracteres, com pelo menos uma letra e um número.`}>
        <PasswordField label="Defina sua senha de acesso" value={form.senha} onChange={set("senha")} show={show} onToggle={setShow} autoComplete="new-password" error={errors.senha} className="md:col-span-2" />
      </FormSection>

      {/* Campo isca contra robôs: fora da tela e fora do Tab. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Site
          <input type="text" name="site" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
        </label>
      </div>

      {error && <FormAlert>{error}</FormAlert>}
      <Button type="submit" variant="buy" size="md" block loading={busy}>
        Criar conta
      </Button>
      <p className="text-caption text-muted">Seus dados vão direto para o cadastro da Padrão Color e são usados só para atender seus pedidos.</p>
    </form>
  );
}
