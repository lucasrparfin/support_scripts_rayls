# Support Scripts

Este projeto contém scripts para interação com contratos inteligentes, incluindo operações de swap entre NFTs e tokens Enygma.

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

`config.cc.json`:
```json
{
  "commitChain": {
    "rpcUrl": "http://commitchain-sandbox.parfin.corp:8545",
    "chainId": 1337,
    "ccDeploymentProxyRegistry": "0xf04686EbBffeb9913Cd8f3EDdF31718992a1c0A2",
    "privateKey": "sua-chave-privada-aqui"
  }
}
```

`config.deployer.json`:
```json
{
  "deployer": {
    "rpcUrl": "http://rayls-node-0-sandbox.api.blockchain-sandbox.parfin.aws/",
    "chainId": 1337,
    "endpointAddress": "0x6C362F82C5e37F44b2f91BD474dc5be2CEfD598e"
  }
}
```

`config.receiver.json`:
```json
{
  "receiver": {
    "rpcUrl": "http://rayls-node-1-sandbox.api.blockchain-sandbox.parfin.aws/",
    "chainId": 1337,
    "endpointAddress": "0x28f167B973ba66230d1D591526CDa7dE5afE7f5B"
  }
}
```

## Executando os Scripts

### ZkDvp Swap NFT Enygma

Este script realiza um swap entre um NFT e tokens Enygma:

```bash
npm run test:zkdvp
```

O script executa as seguintes operações:
1. Configura os provedores e wallets
2. Obtém instâncias dos contratos existentes
3. Deploya tokens Enygma e ERC721
4. Registra e aprova os tokens no Token Registry
5. Realiza o mint dos tokens
6. Executa o depósito dos tokens
7. Realiza o swap
8. Processa os withdraws
9. Executa cross-transfer dos tokens


## Estrutura do Projeto

```
supportScripts/
├── scripts/
│   ├── ZkDvp_Swap_NFT_Enygma-light.ts  # Script principal de swap
│   └── utils.ts                         # Funções utilitárias
├── base-artifacts/                      # Artefatos dos contratos
├── config.cc.json                       # Configuração da Commit Chain
├── config.deployer.json                 # Configuração do Deployer
└── config.receiver.json                 # Configuração do Receiver
```

## Logs

O script utiliza um sistema de logs coloridos para melhor visualização:
- ℹ️ Informações gerais
- ✅ Sucesso
- ❌ Erro
- ➡️ Início de uma nova etapa

## Troubleshooting

Se encontrar erros:

1. Verifique se as RPC URLs estão acessíveis
2. Confirme se as chaves privadas estão corretas
3. Verifique se os endereços dos contratos estão atualizados
4. Certifique-se que as redes estão sincronizadas
