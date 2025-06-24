# Support Scripts

Este projeto contém scripts para interação com contratos inteligentes, incluindo operações de swap entre NFTs e tokens Enygma, deploy e transferência de tokens.

## Pré-requisitos

- Node.js (versão 18 ou superior)
- npm ou yarn
- Acesso às redes RPC configuradas

## Configuração

1. Clone o repositório:
```bash
git clone <repository-url>
cd supportScripts
```

2. Instale as dependências:
```bash
npm install
# ou
yarn install
```

3. Configure os arquivos de configuração:

Crie os seguintes arquivos na raiz do projeto:

### `config.cc.json` (Commit Chain)
```json
{
  "commitChain": {
    "privateKey": "sua-chave-privada-aqui",
    "rpcUrl": "http://commitchain-sandbox.parfin.corp:8545",
    "chainId": 381660001,
    "ccDeploymentProxyRegistry": "0xf04686EbBffeb9913Cd8f3EDdF31718992a1c0A2"
  }
}
```

### `config.deployer.json` (Rede Principal)
```json
{
  "token": {
    "name": "Enygma",
    "symbol": "ENY"
  },
  "deployer": {
    "privateKey": "sua-chave-privada-aqui",
    "rpcUrl": "http://rayls-node-0-sandbox.api.blockchain-sandbox.parfin.aws/",
    "chainId": 800000,
    "endpointAddress": "0x6C362F82C5e37F44b2f91BD474dc5be2CEfD598e"
  }
}
```

### `config.receiver.json` (Rede Destino)
```json
{
  "receiver": {
    "privateKey": "sua-chave-privada-aqui",
    "rpcUrl": "http://rayls-node-1-sandbox.api.blockchain-sandbox.parfin.aws/",
    "chainId": 800001,
    "endpointAddress": "0x28f167B973ba66230d1D591526CDa7dE5afE7f5B"
  },
  "token": {
    "resourceId": "0x12debfecadc6064e2ad9c72693a7e9abade116cf0004b00217f25f6d45198e54"
  }
}
```

## Scripts Disponíveis

### 1. ZkDvp Swap NFT Enygma
Realiza um swap entre um NFT e tokens Enygma usando ZkDvp:

```bash
npm run zkdvp
```

**Funcionalidades:**
- Configura provedores e wallets
- Obtém instâncias dos contratos existentes
- Deploya tokens Enygma e ERC721
- Registra e aprova tokens no Token Registry
- Realiza mint dos tokens
- Executa depósito dos tokens
- Realiza o swap
- Processa withdraws
- Executa cross-transfer dos tokens

### 2. Deploy e Envio de Tokens Enygma
Deploya um token Enygma e envia para outra rede:

```bash
npm run sendEnygma
```

**Funcionalidades:**
- Deploy de token Enygma com nome e símbolo únicos
- Registro do token no TokenRegistry da Commit Chain
- Aprovação automática do token
- Mint de 1000 tokens para o deployer
- Teleport de 100 tokens para o receiver

### 3. Verificar Saldo Enygma no Receiver
Verifica o saldo de tokens Enygma na rede destino:

```bash
npm run checkEnygma
```

### 4. Deploy e Envio de Tokens ERC20
Deploya um token ERC20 padrão e envia para outra rede:

```bash
npm run sendErc20
```

**Funcionalidades:**
- Deploy de token ERC20 com nome e símbolo únicos
- Registro do token no TokenRegistry da Commit Chain
- Aprovação automática do token
- Mint de 1000 tokens para o deployer
- Teleport de 100 tokens para o receiver

### 5. Verificar Saldo ERC20 no Receiver
Verifica o saldo de tokens ERC20 na rede destino:

```bash
npm run checkErc20
```

## Estrutura do Projeto

```
supportScripts/
├── scripts/
│   ├── ZkDvp_Swap_NFT_Enygma-light.ts    # Script principal de swap ZkDvp
│   ├── deployAndSendEnygma.ts            # Deploy e envio de tokens Enygma
│   ├── deployAndSendErc20.ts             # Deploy e envio de tokens ERC20
│   ├── checkEnygmaBalanceOnReceiver.ts   # Verificação de saldo Enygma
│   ├── checkErc20BalanceOnReceiver.ts    # Verificação de saldo ERC20
│   └── utils.ts                          # Funções utilitárias
├── tasks/
│   └── getAllParticipantsFromCc.ts       # Tarefa para obter participantes
├── base-artifacts/                       # Artefatos dos contratos
├── config.cc.json                        # Configuração da Commit Chain
├── config.deployer.json                  # Configuração do Deployer
├── config.receiver.json                  # Configuração do Receiver
└── hardhat.config.ts                     # Configuração do Hardhat
```

## Configurações de Rede

### Commit Chain (config.cc.json)
- **Chain ID:** 381660001
- **RPC URL:** http://commitchain-sandbox.parfin.corp:8545
- **Proxy Registry:** 0xf04686EbBffeb9913Cd8f3EDdF31718992a1c0A2

### Rede Principal (config.deployer.json)
- **Chain ID:** 800000
- **RPC URL:** http://rayls-node-0-sandbox.api.blockchain-sandbox.parfin.aws/
- **Endpoint:** 0x6C362F82C5e37F44b2f91BD474dc5be2CEfD598e

### Rede Destino (config.receiver.json)
- **Chain ID:** 800001
- **RPC URL:** http://rayls-node-1-sandbox.api.blockchain-sandbox.parfin.aws/
- **Endpoint:** 0x28f167B973ba66230d1D591526CDa7dE5afE7f5B

## Logs

O sistema utiliza logs coloridos para melhor visualização:
- ℹ️ **Informações gerais** - Configurações e status
- ✅ **Sucesso** - Operações concluídas com êxito
- ❌ **Erro** - Falhas e exceções
- ➡️ **Etapa** - Início de uma nova etapa do processo

## Troubleshooting

### Problemas Comuns

1. **Erro de Rede (NETWORK_ERROR)**
   - Verifique se as RPC URLs estão acessíveis
   - Confirme se as redes estão sincronizadas
   - Teste a conectividade com as URLs

2. **Erro de Chave Privada**
   - Verifique se as chaves privadas estão corretas
   - Certifique-se que as chaves têm saldo suficiente para gas

3. **Token não encontrado no Registry**
   - Aguarde mais tempo para o registro ser processado
   - Verifique se o submitTokenRegistration foi executado
   - Confirme se o token foi aprovado no TokenRegistry

4. **Operação não suportada (UNSUPPORTED_OPERATION)**
   - Verifique a compatibilidade do provedor RPC
   - Confirme se a versão do Hardhat está atualizada

### Verificações de Diagnóstico

```bash
# Verificar conectividade com as redes
curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' http://rayls-node-0-sandbox.api.blockchain-sandbox.parfin.aws/

# Verificar saldos após operações
npm run checkEnygma
npm run checkErc20
```

## Desenvolvimento

Para adicionar novos scripts:

1. Crie o arquivo TypeScript em `scripts/`
2. Adicione o comando no `package.json`
3. Use as funções utilitárias de `utils.ts`
4. Teste com as configurações de sandbox primeiro

## Dependências

- **Hardhat:** Framework de desenvolvimento Ethereum
- **TypeScript:** Linguagem de programação
- **Ethers.js:** Biblioteca para interação com Ethereum
- **Web3-utils:** Utilitários Web3
