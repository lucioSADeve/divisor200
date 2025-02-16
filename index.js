const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const app = express();

// Armazenamento temporário em memória
const arquivosTemporarios = new Map();

// Configuração do Multer para memória
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // Limite de 50MB
    }
});

// Configurações
const LINHAS_POR_ARQUIVO = 200;

// Configurar pasta de arquivos estáticos
app.use(express.static('public'));
app.use(express.json());

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para upload e processamento
app.post('/upload', upload.single('arquivo'), async (req, res) => {
    console.log('Iniciando upload...');
    
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    try {
        console.log('Processando arquivo:', req.file.originalname);
        
        // Lê o arquivo do buffer
        const workbook = XLSX.read(req.file.buffer);
        const planilha = workbook.Sheets[workbook.SheetNames[0]];
        const dados = XLSX.utils.sheet_to_json(planilha);

        console.log('Total de linhas:', dados.length);
        const totalArquivos = Math.ceil(dados.length / LINHAS_POR_ARQUIVO);
        const arquivosGerados = [];
        const sessionId = Date.now().toString(); // ID único para esta sessão

        // Processa cada parte
        for (let i = 0; i < totalArquivos; i++) {
            const inicio = i * LINHAS_POR_ARQUIVO;
            const fim = Math.min((i + 1) * LINHAS_POR_ARQUIVO, dados.length);
            const dadosParte = dados.slice(inicio, fim);

            const novoWorkbook = XLSX.utils.book_new();
            const novaPlanilha = XLSX.utils.json_to_sheet(dadosParte);
            XLSX.utils.book_append_sheet(novoWorkbook, novaPlanilha, 'Planilha1');

            // Gera o buffer do arquivo
            const buffer = XLSX.write(novoWorkbook, { type: 'buffer', bookType: 'xlsx' });
            
            // Nome do arquivo
            const nomeArquivo = `${path.parse(req.file.originalname).name}_${i + 1}.xlsx`;
            const fileId = `${sessionId}_${nomeArquivo}`;
            
            // Armazena o buffer com um ID único
            arquivosTemporarios.set(fileId, buffer);
            arquivosGerados.push({
                id: fileId,
                nome: nomeArquivo
            });
        }

        // Configura limpeza automática após 1 hora
        setTimeout(() => {
            arquivosGerados.forEach(arquivo => {
                arquivosTemporarios.delete(arquivo.id);
            });
        }, 3600000); // 1 hora

        // Retorna os IDs e nomes dos arquivos
        res.json({
            success: true,
            arquivos: arquivosGerados,
            total: totalArquivos
        });

    } catch (erro) {
        console.error('Erro no processamento:', erro);
        res.status(500).json({ 
            error: 'Erro ao processar arquivo',
            details: erro.message
        });
    }
});

// Rota para download
app.get('/download/:fileId/:nome', (req, res) => {
    try {
        const { fileId, nome } = req.params;
        const buffer = arquivosTemporarios.get(fileId);

        if (!buffer) {
            return res.status(404).json({ error: 'Arquivo não encontrado' });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
        res.send(buffer);

    } catch (erro) {
        console.error('Erro no download:', erro);
        res.status(500).json({ error: 'Erro ao baixar arquivo' });
    }
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (erro) => {
    console.error('Erro não tratado:', erro);
});